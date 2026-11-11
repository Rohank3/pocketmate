import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { finalizeInvoiceResolution } from "@/lib/paypal/settlement";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required to capture order." },
        { status: 401 }
      );
    }

    const { orderId } = await context.params;
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    let invoiceId: string | undefined = undefined;
    try {
      const body = (await req.json()) as { invoiceId?: string };
      if (body?.invoiceId) invoiceId = body.invoiceId;
    } catch {
      // Optional JSON body
    }

    const captureResult = await paypalClient.captureOrder(orderId);
    const resolvedInvoiceId = invoiceId || captureResult.customId;

    let settlementSummary = null;
    if (resolvedInvoiceId) {
      settlementSummary = await finalizeInvoiceResolution({
        invoiceId: resolvedInvoiceId,
        payerUserId: user.id,
        payerName: user.name || user.email.split("@")[0],
        payerEmail: user.email,
        action: "pay",
        originalAmount: captureResult.amount > 0 ? captureResult.amount : undefined,
        reason: `Paid via PayPal Checkout (Order ${captureResult.orderId})`,
      });
    }

    return NextResponse.json({
      success: true,
      capture: captureResult,
      settlement: settlementSummary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to capture PayPal order";
    console.error("[PayPal Orders Capture Error]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
