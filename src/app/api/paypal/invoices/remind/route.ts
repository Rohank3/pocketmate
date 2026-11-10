import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { paypalClient } from "@/lib/paypal/client";
import { z } from "zod";

const RemindInvoiceSchema = z.object({
  invoiceId: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: Active authenticated session required." },
        { status: 401 }
      );
    }

    const rawBody = await req.json();
    const parseResult = RemindInvoiceSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { invoiceId, note } = parseResult.data;

    const res = await paypalClient.sendInvoiceReminder(invoiceId, {
      subject: "Payment Reminder: Shared Expense via PocketMate",
      note: note || "Friendly reminder to settle your pending shared expense via PayPal.",
    });

    return NextResponse.json({
      success: true,
      message: `Payment reminder dispatched successfully via PayPal Sandbox for invoice ${invoiceId}.`,
      invoiceId: res.invoiceId,
    });
  } catch (error: unknown) {
    console.error("[PayPal Remind Invoice Error]", error);
    const errMessage = error instanceof Error ? error.message : "Failed to send PayPal invoice reminder.";
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}
