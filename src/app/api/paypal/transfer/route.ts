import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { z } from "zod";

const TransferSchema = z.object({
  recipientEmail: z.string().trim().email().max(255),
  amount: z
    .number()
    .finite()
    .positive("Amount must be greater than zero.")
    .max(50000, "Amount exceeds maximum transfer limit.")
    .refine(
      (n) => Math.round(n * 100) === n * 100,
      "Amount cannot have more than 2 decimal places."
    ),
  note: z.string().trim().max(255).optional(),
  currency: z.string().trim().max(10).default("USD"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required to initiate direct payouts." },
        { status: 401 }
      );
    }

    const rawBody = await req.json();
    const parseResult = TransferSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: parseResult.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 }
      );
    }

    const { recipientEmail, amount, note, currency } = parseResult.data;

    const result = await paypalClient.sendPayout({
      recipientEmail,
      amount,
      note: note || "Direct P2P Settlement via PocketMate",
      currency,
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
