import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { z } from "zod";

const CreateOrderSchema = z.object({
  amount: z
    .number()
    .finite()
    .positive("Order amount must be greater than zero.")
    .max(50000, "Amount exceeds checkout threshold.")
    .refine(
      (n) => Math.round(n * 100) === n * 100,
      "Amount cannot have more than 2 decimal places."
    ),
  currency: z.string().trim().max(10).default("USD"),
  description: z.string().trim().max(255).optional(),
  customId: z.string().trim().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required to initiate checkout order." },
        { status: 401 }
      );
    }

    const rawBody = await req.json();
    const parseResult = CreateOrderSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { amount, currency, description, customId } = parseResult.data;

    const order = await paypalClient.createOrder({
      amount,
      currency,
      description: description || "PocketMate Expense Settlement",
      customId,
    });

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create PayPal order";
    console.error("[PayPal Orders Create Error]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
