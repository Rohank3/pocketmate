/**
 * Resilient Gemini API Client
 * - Supports automatic failover between GEMINI_API_KEY and GEMINI_API_KEY_SECONDARY on 429 quota limits
 * - Handles model fallback to gemini-3.1-flash-lite
 * - Preserves thoughtSignature across multi-turn tool calling
 */

export interface GeminiApiOptions {
  contents: Array<{
    role: "user" | "model";
    parts: Array<Record<string, unknown>>;
  }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }>;
  }>;
  generationConfig?: Record<string, unknown>;
  stream?: boolean;
  timeoutMs?: number;
}

export function getGeminiApiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your-gemini-api-key") {
    keys.push(process.env.GEMINI_API_KEY.trim());
  }
  if (process.env.GEMINI_API_KEY_SECONDARY && process.env.GEMINI_API_KEY_SECONDARY !== "your-gemini-api-key") {
    const sec = process.env.GEMINI_API_KEY_SECONDARY.trim();
    if (!keys.includes(sec)) {
      keys.push(sec);
    }
  }
  return keys;
}

export function getPrimaryGeminiModel(): string {
  const envModel = process.env.GEMINI_MODEL?.trim();
  // Filter out obsolete 3.5-flash which returns 404
  if (envModel && envModel !== "gemini-3.5-flash") {
    return envModel;
  }
  return "gemini-3.1-flash-lite";
}

/**
 * Executes a resilient fetch call to Google Generative Language API with key failover
 */
export async function callGeminiApi(options: GeminiApiOptions): Promise<Response> {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error("No valid GEMINI_API_KEY configured in environment.");
  }

  const model = getPrimaryGeminiModel();
  const endpoint = options.stream ? "streamGenerateContent" : "generateContent";
  const urlSuffix = options.stream ? "&alt=sse" : "";
  const timeoutMs = options.timeoutMs ?? 15000;

  const bodyPayload: Record<string, unknown> = {
    contents: options.contents,
    ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
    ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
    generationConfig: options.generationConfig || { temperature: 0.2 },
  };

  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (const apiKey of keys) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}${urlSuffix}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (res.ok) {
        return res;
      }

      // If rate limited (429) or service unavailable (503), try next key
      if (res.status === 429 || res.status === 503) {
        console.warn(`[Gemini API] Key returned HTTP ${res.status}. Attempting key failover...`);
        lastResponse = res;
        continue;
      }

      // If model not found (404), attempt fallback to gemini-3.1-flash-lite
      if (res.status === 404 && model !== "gemini-3.1-flash-lite") {
        console.warn(`[Gemini API] Model ${model} returned 404. Falling back to gemini-3.1-flash-lite.`);
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:${endpoint}?key=${apiKey}${urlSuffix}`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });
        if (fallbackRes.ok) {
          return fallbackRes;
        }
      }

      lastResponse = res;
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini API] Network/abort error on key:`, err);
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError || new Error("Failed to communicate with Gemini API across all configured keys.");
}
