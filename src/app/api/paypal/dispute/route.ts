import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { z } from "zod";

const DisputeSchema = z.object({
  transactionId: z.string().trim().min(1, "transactionId is required.").max(100),
  reason: z.string().trim().min(1).max(255).default("Unrecognized surcharge identified during receipt audit"),
  amount: z.number().finite().positive("amount must be a positive number.").max(50000),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required to file disputes." },
        { status: 401 }
      );
    }
    const rawBody = await req.json();
    const parseResult = DisputeSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { transactionId, reason, amount } = parseResult.data;

    const disputeResult = await paypalClient.initiateDispute(
      transactionId,
      reason,
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
