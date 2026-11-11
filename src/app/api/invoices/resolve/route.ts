import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { paypalClient } from "@/lib/paypal/client";
import { resolvePublicOrigin } from "@/lib/paypal/auth";
import { finalizeInvoiceResolution, resolveInvoiceParties } from "@/lib/paypal/settlement";
import { z } from "zod";

const InvoiceResolutionSchema = z.object({
  invoiceId: z.string().trim().min(1).max(100),
  splitItemId: z.string().trim().optional(),
  action: z.enum(["pay", "decline"]),
  reason: z.string().trim().max(1000).optional(),
  originalAmount: z.number().finite().positive().max(500000).optional(),
  memo: z.string().trim().max(255).optional(),
  senderName: z.string().trim().max(100).optional(),
  senderEmail: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v && v.includes("@") ? v : undefined)),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser?.id;

    if (!userId || !authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required." },
        { status: 401 }
      );
    }

    const rawBody = await req.json();
    const parseResult = InvoiceResolutionSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const {
      invoiceId,
      splitItemId,
      action,
      reason,
      originalAmount = 0,
      memo = "Split invoice",
      senderName = "",
      senderEmail,
    } = parseResult.data;

    const payerName = authUser.name || authUser.email.split("@")[0];
    const payerEmail = authUser.email;

    const parties = await resolveInvoiceParties({
      invoiceId,
      splitItemId,
      payerUserId: userId,
      payerEmail,
      senderEmail,
      senderName,
    });

    const resolvedInvoiceId = parties.resolvedInvoiceId;
    const effectiveOriginal =
      parties.splitItem?.amount || parties.payerLedgerTx?.amount || originalAmount;
    const effectiveDescription =
      parties.splitItem?.splitRecord?.description ||
      parties.payerLedgerTx?.memo ||
      parties.payerLedgerTx?.merchantName ||
      memo;

    // When paying and the organizer has completed Partner onboarding (`CONNECTED`),
    // create an Orders v2 direct-payee checkout routing funds straight into the organizer's PayPal balance.
    if (
      action === "pay" &&
      parties.organizerUser?.paypalOnboardingStatus === "CONNECTED" &&
      parties.organizerUser.paypalMerchantId &&
      effectiveOriginal > 0
    ) {
      const origin = resolvePublicOrigin(req);
      const order = await paypalClient.createOrder({
        amount: effectiveOriginal,
        description: effectiveDescription,
        customId: resolvedInvoiceId,
        payeeMerchantId: parties.organizerUser.paypalMerchantId,
        returnUrl: `${origin}/?order_status=approved&invoice_id=${encodeURIComponent(
          resolvedInvoiceId
        )}`,
        cancelUrl: `${origin}/?order_status=cancelled&invoice_id=${encodeURIComponent(
          resolvedInvoiceId
        )}`,
      });

      return NextResponse.json({
        success: true,
        action,
        requiresCheckoutRedirect: true,
        orderId: order.orderId,
        invoiceId: resolvedInvoiceId,
        paypalInvoiceUrl:
          order.approveUrl ||
          `https://www.sandbox.paypal.com/invoice/p/#${resolvedInvoiceId}`,
        message: `Created PayPal direct settlement checkout to ${parties.resolvedSenderName}.`,
      });
    }

    const settled = await finalizeInvoiceResolution({
      invoiceId: resolvedInvoiceId,
      splitItemId: parties.splitItem?.id || splitItemId,
      payerUserId: userId,
      payerName,
      payerEmail,
      action,
      reason,
      originalAmount: effectiveOriginal,
      memo: effectiveDescription,
      senderName: parties.resolvedSenderName,
      senderEmail: parties.resolvedSenderEmail,
    });

    const isLive = process.env.PAYPAL_ENVIRONMENT === "live";
    const paypalInvoiceUrl = isLive
      ? `https://www.paypal.com/invoice/p/#${settled.invoiceId}`
      : `https://www.sandbox.paypal.com/invoice/p/#${settled.invoiceId}`;

    return NextResponse.json({
      success: true,
      action,
      requiresCheckoutRedirect: false,
      invoiceId: settled.invoiceId,
      paypalInvoiceUrl,
      message:
        action === "pay"
          ? `Settled invoice for $${settled.amount.toFixed(2)}.`
          : `Declined invoice ${settled.invoiceId}.`,
    });
  } catch (error) {
    console.error("[Invoice Resolution API Error]", error);
    return NextResponse.json(
      { error: "Internal server error resolving invoice." },
      { status: 500 }
    );
  }
}
