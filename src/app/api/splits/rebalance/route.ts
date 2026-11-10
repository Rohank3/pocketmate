import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { paypalClient } from "@/lib/paypal/client";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const RebalanceParticipantSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  originalAmount: z.number().finite().nonnegative(),
  amountPaid: z.number().finite().nonnegative(),
  newShare: z.number().finite().nonnegative(),
  isHost: z.boolean().default(false),
  reason: z.string().trim().max(500).optional(),
  status: z.string().optional(),
});

const RebalanceSplitSchema = z.object({
  splitRecordId: z.string().trim().min(1),
  totalBill: z.number().finite().positive(),
  memo: z.string().trim().max(255).optional(),
  participants: z.array(RebalanceParticipantSchema).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: Active session required." },
        { status: 401 }
      );
    }

    const rawBody = await req.json();
    const parseResult = RebalanceSplitSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { splitRecordId, totalBill, memo, participants } = parseResult.data;

    const splitRecord = await prisma.splitRecord.findUnique({
      where: { id: splitRecordId },
      include: { items: true },
    });

    if (!splitRecord) {
      return NextResponse.json({ error: "Split record not found." }, { status: 404 });
    }

    const senderInfo = authUser?.email
      ? {
          name: authUser.name || authUser.email.split("@")[0].replace(/[._]/g, " "),
          email: authUser.email,
        }
      : undefined;

    const supplementalDispatched: Array<{ name: string; email: string; amount: number; invoiceId: string }> = [];
    const reissuedInvoices: Array<{ name: string; email: string; amount: number; invoiceId: string }> = [];
    const refundsQueue: Array<{ name: string; email: string; amount: number; reason: string }> = [];

    const updatedItemsJson: Array<Record<string, unknown>> = [];

    for (const p of participants) {
      if (p.isHost || p.name.toLowerCase() === "you" || p.name.toLowerCase() === "me") {
        updatedItemsJson.push({
          participantName: p.name,
          participantEmail: p.email,
          isHost: true,
          amount: p.newShare,
          amountPaid: p.newShare,
          status: "PAID",
        });
        continue;
      }

      const delta = Math.round((p.newShare - p.amountPaid) * 100) / 100;
      const isDeclinedOrUnpaid = p.amountPaid === 0;

      let currentInvoiceId = `INV2-${Date.now()}`;

      if (isDeclinedOrUnpaid) {
        // Person declined or never paid -> dispatch fresh invoice for newShare
        if (p.newShare > 0) {
          try {
            const inv = await paypalClient.dispatchInvoice({
              email: p.email,
              name: p.name,
              amount: p.newShare,
              description: `${memo || splitRecord.description} (Rebalanced Share)`,
            }, senderInfo);
            currentInvoiceId = inv.invoiceId;
            reissuedInvoices.push({
              name: p.name,
              email: p.email,
              amount: p.newShare,
              invoiceId: currentInvoiceId,
            });
          } catch (invErr) {
            console.warn("[PayPal Rebalance Invoice Warning]", invErr);
          }
        }
      } else if (delta > 0) {
        // Person paid less than new target share -> send supplemental invoice for difference
        try {
          const inv = await paypalClient.dispatchInvoice({
            email: p.email,
            name: p.name,
            amount: delta,
            description: `Supplemental balance for ${memo || splitRecord.description}`,
          }, senderInfo);
          currentInvoiceId = inv.invoiceId;
          supplementalDispatched.push({
            name: p.name,
            email: p.email,
            amount: delta,
            invoiceId: currentInvoiceId,
          });
        } catch (invErr) {
          console.warn("[PayPal Supplemental Invoice Warning]", invErr);
        }
      } else if (delta < 0) {
        // Person paid MORE than new target share -> queue refund payout to return excess money
        refundsQueue.push({
          name: p.name,
          email: p.email,
          amount: Math.abs(delta),
          reason: `Refund for ${memo || splitRecord.description} overpayment (Share reduced to $${p.newShare.toFixed(2)})`,
        });
      }

      // Find matching SplitItem
      const existingItem = splitRecord.items.find(
        (it) => it.participantEmail.toLowerCase() === p.email.toLowerCase() || it.participantName === p.name
      );

      const itemStatus = delta <= 0 && p.amountPaid >= p.newShare ? "PAID" : "SENT";

      if (existingItem) {
        await prisma.splitItem.update({
          where: { id: existingItem.id },
          data: {
            amount: p.newShare,
            status: itemStatus,
            paypalInvoiceId: currentInvoiceId,
          },
        });
      }

      updatedItemsJson.push({
        participantName: p.name,
        participantEmail: p.email,
        originalAmount: p.originalAmount,
        amountPaid: p.amountPaid,
        amount: p.newShare,
        newShare: p.newShare,
        delta,
        status: itemStatus,
        reason: p.reason || "",
        invoiceId: currentInvoiceId,
        rebalancedAt: new Date().toISOString(),
      });
    }

    // Update SplitRecord
    await prisma.splitRecord.update({
      where: { id: splitRecordId },
      data: {
        totalAmount: totalBill,
        itemsJson: updatedItemsJson as unknown as Prisma.InputJsonValue,
        status: refundsQueue.length === 0 && supplementalDispatched.length === 0 && reissuedInvoices.length === 0 ? "SETTLED" : "SENT",
      },
    });

    return NextResponse.json({
      success: true,
      splitRecordId,
      supplementalDispatched,
      reissuedInvoices,
      refundsQueue,
      message: `Successfully rebalanced split for ${memo || splitRecord.description}. ${
        supplementalDispatched.length > 0
          ? `Sent ${supplementalDispatched.length} supplemental invoice(s). `
          : ""
      }${
        reissuedInvoices.length > 0 ? `Reissued ${reissuedInvoices.length} updated invoice(s). ` : ""
      }${
        refundsQueue.length > 0
          ? `${refundsQueue.length} participant(s) are owed refund payouts.`
          : ""
      }`,
    });
  } catch (error) {
    console.error("[Rebalance Split API Error]", error);
    return NextResponse.json({ error: "Internal server error rebalancing split." }, { status: 500 });
  }
}
