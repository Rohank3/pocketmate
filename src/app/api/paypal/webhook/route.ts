import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const authAlgo = req.headers.get("paypal-auth-algo") || "";
    const certUrl = req.headers.get("paypal-cert-url") || "";
    const transmissionId = req.headers.get("paypal-transmission-id") || "";
    const transmissionSig = req.headers.get("paypal-transmission-sig") || "";
    const transmissionTime = req.headers.get("paypal-transmission-time") || "";
    const webhookId = process.env.PAYPAL_WEBHOOK_ID || "";

    // If webhook ID is configured, perform strict cryptographic verification with PayPal
    if (webhookId && authAlgo && certUrl && transmissionId && transmissionSig) {
      const isValid = await paypalClient.verifyWebhookSignature({
        authAlgo,
        certUrl,
        transmissionId,
        transmissionSig,
        transmissionTime,
        webhookId,
        webhookEvent: event,
      });

      if (!isValid) {
        console.warn("[PayPal Webhook] Cryptographic signature verification failed.");
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === "production" && webhookId) {
      return NextResponse.json({ error: "Missing required PayPal signature headers" }, { status: 400 });
    }

    const eventType = (event.event_type as string) || "";
    const resource = (event.resource as Record<string, unknown>) || {};

    console.info(`[PayPal Webhook] Received verified event: ${eventType}`);

    // 1. Handle Invoice Paid
    if (eventType === "INVOICING.INVOICE.PAID") {
      const invoiceId = (resource.id as string) || "";
      if (invoiceId) {
        try {
          await prisma.splitItem.updateMany({
            where: { paypalInvoiceId: invoiceId },
            data: { status: "PAID" },
          });
        } catch (dbErr) {
          console.warn("[PayPal Webhook DB Warning]", dbErr);
        }
      }
    }

    // 2. Handle Invoice Cancelled
    if (eventType === "INVOICING.INVOICE.CANCELLED") {
      const invoiceId = (resource.id as string) || "";
      if (invoiceId) {
        try {
          await prisma.splitItem.updateMany({
            where: { paypalInvoiceId: invoiceId },
            data: { status: "CANCELLED" },
          });
        } catch (dbErr) {
          console.warn("[PayPal Webhook DB Warning]", dbErr);
        }
      }
    }

    // 3. Handle Invoice Refunded
    if (eventType === "INVOICING.INVOICE.REFUNDED") {
      const invoiceId = (resource.id as string) || "";
      if (invoiceId) {
        try {
          await prisma.splitItem.updateMany({
            where: { paypalInvoiceId: invoiceId },
            data: { status: "CANCELLED" },
          });
        } catch (dbErr) {
          console.warn("[PayPal Webhook DB Warning]", dbErr);
        }
      }
    }

    // 4. Handle Payment Capture Completed
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const captureId = (resource.id as string) || "";
      const customId = (resource.custom_id as string) || "";
      if (customId || captureId) {
        try {
          await prisma.splitItem.updateMany({
            where: {
              OR: [
                ...(customId ? [{ id: customId }] : []),
                ...(captureId ? [{ paypalInvoiceId: captureId }] : []),
              ],
            },
            data: { status: "PAID" },
          });
        } catch (dbErr) {
          console.warn("[PayPal Webhook DB Warning]", dbErr);
        }
      }
    }

    // 4b. Handle Payment Capture Refunded
    if (eventType === "PAYMENT.CAPTURE.REFUNDED") {
      const captureId = (resource.id as string) || "";
      const customId = (resource.custom_id as string) || "";
      if (customId || captureId) {
        try {
          await prisma.splitItem.updateMany({
            where: {
              OR: [
                ...(customId ? [{ id: customId }] : []),
                ...(captureId ? [{ paypalInvoiceId: captureId }] : []),
              ],
            },
            data: { status: "CANCELLED" },
          });
        } catch (dbErr) {
          console.warn("[PayPal Webhook DB Warning]", dbErr);
        }
      }
    }

    // 5. Handle Checkout Order Approved (execute automatic backend capture)
    if (eventType === "CHECKOUT.ORDER.APPROVED") {
      const orderId = (resource.id as string) || "";
      if (orderId) {
        try {
          await paypalClient.captureOrder(orderId);
          console.info(`[PayPal Webhook] Order ${orderId} captured automatically upon approval.`);
        } catch (captureErr) {
          console.warn("[PayPal Webhook Auto-Capture Warning]", captureErr);
        }
      }
    }

    // 6. Handle Direct Payout Succeeded & Failed
    if (eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED") {
      const senderItemId = (resource.sender_item_id as string) || "";
      console.info(`[PayPal Webhook] Direct payout item succeeded: ${senderItemId}`);
    }

    if (eventType === "PAYMENT.PAYOUTS-ITEM.FAILED") {
      const senderItemId = (resource.sender_item_id as string) || "";
      console.warn(`[PayPal Webhook] Direct payout item failed: ${senderItemId}`);
    }

    // 7. Handle Customer Dispute Created
    if (eventType === "CUSTOMER.DISPUTE.CREATED") {
      const disputeId = (resource.dispute_id as string) || "";
      const disputedTx = (resource.disputed_transactions as Array<{ buyer_transaction_id?: string }>)?.[0];
      const captureId = disputedTx?.buyer_transaction_id;

      console.info(`[PayPal Webhook] Customer dispute created: ${disputeId} against transaction ${captureId}`);
      if (captureId) {
        try {
          await prisma.splitItem.updateMany({
            where: { paypalInvoiceId: captureId },
            data: { status: "FAILED" },
          });
        } catch (dbErr) {
          console.warn("[PayPal Webhook DB Warning]", dbErr);
        }
      }
    }

    // 8. Handle Customer Dispute Resolved
    if (eventType === "CUSTOMER.DISPUTE.RESOLVED") {
      const disputeId = (resource.dispute_id as string) || "";
      const disputedTx = (resource.disputed_transactions as Array<{ buyer_transaction_id?: string }>)?.[0];
      const captureId = disputedTx?.buyer_transaction_id;

      console.info(`[PayPal Webhook] Customer dispute resolved: ${disputeId} for transaction ${captureId}`);
      if (captureId) {
        try {
          await prisma.splitItem.updateMany({
            where: { paypalInvoiceId: captureId },
            data: { status: "PAID" },
          });
        } catch (dbErr) {
          console.warn("[PayPal Webhook DB Warning]", dbErr);
        }
      }
    }

    return NextResponse.json({ received: true, eventType });
  } catch (err: unknown) {
    console.error("[PayPal Webhook Error]", err);
    return NextResponse.json({ error: "Internal webhook processor error" }, { status: 500 });
  }
}
