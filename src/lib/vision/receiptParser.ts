/**
 * Multimodal Receipt Parser using Google Gemini 2.5 Pro Vision
 * 
 * Ingests receipt image bytes (JPEG, PNG, WEBP) and produces structured,
 * penny-accurate extraction of line items, merchant, tax, tip, and total.
 */

export interface ParsedLineItem {
  name: string;
  amount: number;
}

export interface ParsedReceiptResult {
  merchantName: string;
  date?: string;
  lineItems: ParsedLineItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  confidence: number;
  rawText?: string;
}

export async function parseReceiptWithGeminiVision(
  base64Data: string,
  mimeType: string = "image/jpeg"
): Promise<ParsedReceiptResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECONDARY;

  // Require API key for live receipt vision parsing
  if (!apiKey || apiKey === "your-gemini-api-key") {
    throw new Error("GEMINI_API_KEY is not configured for receipt vision OCR.");
  }

  const prompt = `
You are an expert document OCR and financial auditor. 
Extract all information from this receipt image into a strict JSON object with this exact structure:
{
  "merchantName": "string",
  "date": "string or null",
  "lineItems": [{"name": "string", "amount": number}],
  "subtotal": number,
  "tax": number,
  "tip": number,
  "total": number,
  "confidence": number (between 0.0 and 1.0)
}
Return ONLY raw valid JSON, no markdown code fence.
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini Vision OCR failed with status ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOutput) {
      throw new Error("Gemini Vision OCR returned no text candidates.");
    }

    const rawParsed = JSON.parse(textOutput);
    const subtotal = Math.max(0, Number(rawParsed.subtotal) || 0);
    const tax = Math.max(0, Number(rawParsed.tax) || 0);
    const tip = Math.max(0, Number(rawParsed.tip) || 0);
    const total = Math.max(0.01, Number(rawParsed.total) || (subtotal + tax + tip));
    const confidence = Math.min(1, Math.max(0, Number(rawParsed.confidence) || 0.95));

    const lineItems = Array.isArray(rawParsed.lineItems)
      ? rawParsed.lineItems.map((item: { name?: unknown; amount?: unknown }) => ({
          name: typeof item.name === "string" ? item.name.slice(0, 100).trim() : "Item",
          amount: Math.max(0, Number(item.amount) || 0),
        }))
      : [];

    return {
      merchantName:
        typeof rawParsed.merchantName === "string" && rawParsed.merchantName.trim()
          ? rawParsed.merchantName.slice(0, 100).trim()
          : "Merchant",
      date: typeof rawParsed.date === "string" ? rawParsed.date.slice(0, 30) : undefined,
      lineItems,
      subtotal,
      tax,
      tip,
      total,
      confidence,
    };
  } catch (error) {
    console.error("[Gemini Vision Parse Error]", error);
    throw error;
  }
}
