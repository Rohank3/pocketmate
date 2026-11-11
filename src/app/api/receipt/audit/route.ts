import { NextRequest, NextResponse } from "next/server";
import { parseReceiptWithGeminiVision } from "@/lib/vision/receiptParser";
import { getUserLedgerTransactions } from "@/lib/paypal/sync";
import { getAuthenticatedUser } from "@/lib/auth/session";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required." },
        { status: 401 }
      );
    }
    const contentType = req.headers.get("content-type") || "";
    let base64Image = "";
    let mimeType = "image/jpeg";
    let transactionId = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const txIdField = formData.get("transactionId") as string | null;
      if (txIdField) transactionId = txIdField.slice(0, 100).trim();

      if (!file) {
        return NextResponse.json({ error: "Missing receipt image file in form data." }, { status: 400 });
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File exceeds maximum size of 10MB." }, { status: 400 });
      }

      mimeType = (file.type || "image/jpeg").toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return NextResponse.json(
          { error: "Unsupported image format. Allowed formats: JPEG, PNG, WEBP, HEIC." },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      base64Image = Buffer.from(arrayBuffer).toString("base64");
    } else {
      const json = await req.json();
      base64Image = typeof json.imageBase64 === "string" ? json.imageBase64 : "";
      mimeType = typeof json.mimeType === "string" ? json.mimeType.toLowerCase() : "image/jpeg";
      if (json.transactionId && typeof json.transactionId === "string") {
        transactionId = json.transactionId.slice(0, 100).trim();
      }

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return NextResponse.json(
          { error: "Unsupported image format. Allowed formats: JPEG, PNG, WEBP, HEIC." },
          { status: 400 }
        );
      }

      // Strip data URI prefix if present
      base64Image = base64Image.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

      if (!base64Image || base64Image.length > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "Invalid or oversized image payload." }, { status: 400 });
      }
    }

    // Parse receipt with Gemini 2.5 Pro Vision
    const parsedReceipt = await parseReceiptWithGeminiVision(base64Image, mimeType);

    // Cross-check against user's persisted PayPal transactions
    const recentTxs = await getUserLedgerTransactions(user.id, user.email, { hoursBack: 168 });
    const parsedMerchantLower = (parsedReceipt.merchantName || "").toLowerCase();

    const matchedTx =
      (transactionId ? recentTxs.find((t) => t.id === transactionId) : null) ||
      recentTxs.find(
        (t) =>
          parsedMerchantLower &&
          (t.merchantName.toLowerCase().includes(parsedMerchantLower) ||
            parsedMerchantLower.includes(t.merchantName.toLowerCase()))
      ) ||
      recentTxs.find((t) => Math.abs(t.amount - parsedReceipt.total) <= 30) || {
        id: transactionId || `receipt_${Date.now()}`,
        amount: parsedReceipt.total,
        merchantName: parsedReceipt.merchantName,
      };

    const receiptTotalWithTaxTip = parsedReceipt.total;
    const chargedTotal = matchedTx.amount;
    const diff = Number(Math.abs(chargedTotal - receiptTotalWithTaxTip).toFixed(2));
    const isDiscrepancy = diff > 0.05;

    return NextResponse.json({
      success: true,
      parsedReceipt,
      transaction: matchedTx,
      audit: {
        receiptTotal: receiptTotalWithTaxTip,
        chargedTotal,
        discrepancyDetected: isDiscrepancy,
        discrepancyAmount: diff,
        explanation: isDiscrepancy
          ? `Receipt line items, tax, and tip sum to $${receiptTotalWithTaxTip.toFixed(2)}, but PayPal charge was settled at $${chargedTotal.toFixed(2)}. Unlisted difference of $${diff.toFixed(2)} detected.`
          : "Receipt perfectly matches settled PayPal charge.",
        suggestedActions: isDiscrepancy
          ? [
              { action: "DISPUTE_SURCHARGE", label: `Dispute $${diff.toFixed(2)} unauthorized surcharge via PayPal` },
              { action: "SPLIT_SETTLED_AMOUNT", label: `Split full settled amount ($${chargedTotal.toFixed(2)}) anyway` },
            ]
          : [{ action: "PROCEED_SPLIT", label: "Proceed with split" }],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error auditing receipt";
    console.error("[Receipt Audit Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
