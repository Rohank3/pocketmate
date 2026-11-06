import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipientEmail, amount, note, currency } = body as {
      recipientEmail?: string;
      amount?: number;
      note?: string;
      currency?: string;
    };

    if (!recipientEmail || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "recipientEmail and a positive amount are required." },
        { status: 400 }
      );
    }

    const result = await paypalClient.sendPayout({
      recipientEmail,
      amount,
      note: note || "Direct P2P Settlement via PocketMate",
      currency: currency || "USD",
    });

    return NextResponse.json({
      success: true,
      message: `Dispatched PayPal Sandbox payout of $${amount.toFixed(2)} to ${recipientEmail}`,
      payout: result,
    });
  } catch (error: unknown) {
    console.error("[PayPal Transfer API Error]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute PayPal payout",
      },
      { status: 500 }
    );
  }
}
