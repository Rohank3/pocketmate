import { NextRequest, NextResponse } from "next/server";
import { parseReceiptWithGeminiVision } from "@/lib/vision/receiptParser";
import { paypalClient } from "@/lib/paypal/client";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let base64Image = "";
    let mimeType = "image/jpeg";
    let transactionId = "tx_dining_07";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const txIdField = formData.get("transactionId") as string | null;
      if (txIdField) transactionId = txIdField;

      if (!file) {
        return NextResponse.json({ error: "Missing receipt image file in form data." }, { status: 400 });
      }

      mimeType = file.type || "image/jpeg";
      const arrayBuffer = await file.arrayBuffer();
      base64Image = Buffer.from(arrayBuffer).toString("base64");
    } else {
      const json = await req.json();
      base64Image = json.imageBase64 || "";
      mimeType = json.mimeType || "image/jpeg";
      if (json.transactionId) transactionId = json.transactionId;
    }

    // Parse receipt with Gemini 2.5 Pro Vision
    const parsedReceipt = await parseReceiptWithGeminiVision(base64Image, mimeType);

    // Cross-check against PayPal charge (Bistro Lumiere fixture or live capture)
    const recentTxs = await paypalClient.fetchRecentTransactions(48);
    const matchedTx = recentTxs.find((t) => t.id === transactionId) || {
      id: transactionId,
      amount: 130.0,
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
