import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
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
  category: z.string().trim().max(50).optional(),
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

    const { recipientEmail, amount, note, category, currency } = parseResult.data;

    const result = await paypalClient.sendPayout({
      recipientEmail,
      amount,
      note: note || "Direct P2P Settlement via PocketMate",
      currency,
    });

    if (category && user.id) {
      try {
        await prisma.transactionCategoryOverride.upsert({
          where: {
            userId_transactionId: {
              userId: user.id,
              transactionId: result.payoutBatchId,
            },
          },
          update: { categoryName: category },
          create: {
            userId: user.id,
            transactionId: result.payoutBatchId,
            categoryName: category,
          },
        });
      } catch (catErr) {
        console.warn("[Transfer Category Override Warning]", catErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Dispatched PayPal Sandbox payout of $${amount.toFixed(2)} to ${recipientEmail}${category ? ` [${category}]` : ""}`,
      payout: result,
      category: category || "Personal Reimbursement",
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
