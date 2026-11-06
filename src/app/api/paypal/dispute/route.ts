import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";

export async function POST(req: NextRequest) {
  try {
    const { transactionId, reason, amount } = await req.json();

    if (!transactionId || typeof amount !== "number") {
      return NextResponse.json(
        { error: "Invalid payload: 'transactionId' and numeric 'amount' are required." },
        { status: 400 }
      );
    }

    const disputeResult = await paypalClient.initiateDispute(
      transactionId,
      reason || "Unrecognized surcharge identified during receipt audit",
      amount
    );

    return NextResponse.json({
      success: true,
      ...disputeResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error filing dispute";
    console.error("[PayPal Dispute API Error]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
