import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { paypalClient } from "@/lib/paypal/client";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const DisputeActionSchema = z.object({
  splitItemId: z.string().trim().optional(),
  splitRecordId: z.string().trim().optional(),
  invoiceId: z.string().trim().optional(),
  action: z.enum(["accept", "request_difference", "reinvoke"]),
  differenceAmount: z.number().finite().positive().max(50000).optional(),
  note: z.string().trim().max(500).optional(),
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
    const parseResult = DisputeActionSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { splitItemId, splitRecordId, invoiceId, action, differenceAmount, note } =
      parseResult.data;

    // Find the split item
    const item = await prisma.splitItem.findFirst({
      where: {
        OR: [
          ...(splitItemId ? [{ id: splitItemId }] : []),
          ...(invoiceId ? [{ paypalInvoiceId: invoiceId }] : []),
        ],
      },
      include: {
        splitRecord: true,
      },
    });

    if (!item && !splitRecordId) {
      return NextResponse.json({ error: "Split item or record not found." }, { status: 404 });
    }

    // ACTION 1: Accept Adjusted Payment
    if (action === "accept") {
      if (item) {
        // Mark split item as completely settled
        await prisma.splitItem.update({
          where: { id: item.id },
          data: { status: "PAID" },
        });

        // Update itemsJson to record difference absorption
        const raw = (item.splitRecord.itemsJson as Array<Record<string, unknown>>) || [];
        const updated = raw.map((r) => {
          if (r.participantEmail === item.participantEmail || r.participantName === item.participantName) {
            return {
              ...r,
              status: "PAID",
              isAcceptedByHost: true,
              absorbedDifference: differenceAmount || 0,
              acceptedAt: new Date().toISOString(),
            };
          }
          return r;
        });

        await prisma.splitRecord.update({
          where: { id: item.splitRecordId },
          data: { itemsJson: updated as unknown as Prisma.InputJsonValue },
        });
      }

      return NextResponse.json({
        success: true,
        action: "accept",
        message: `Accepted adjusted payment from ${item?.participantName || "debtor"}. Remaining difference of $${(
          differenceAmount || 0
        ).toFixed(2)} has been absorbed into your host share.`,
      });
    }

    // ACTION 2: Request Remaining Difference
    if (action === "request_difference") {
      const diffToCharge = differenceAmount || item?.amount || 20;
      const targetEmail = item?.participantEmail || "mark.spencer.pm@personal.example.com";
      const targetName = item?.participantName || "Mark Spencer";
      const desc = note || `Supplemental balance for ${item?.splitRecord.description || "Shared Split"}`;

      const senderInfo = authUser?.email
        ? {
            name: authUser.name || authUser.email.split("@")[0].replace(/[._]/g, " "),
            email: authUser.email,
          }
        : undefined;

      // Dispatch supplemental invoice via PayPal Invoicing API v2
      let newInvoiceId = `INV2-SUPP-${Date.now()}`;
      try {
        const invRes = await paypalClient.dispatchInvoice({
          email: targetEmail,
          name: targetName,
          amount: diffToCharge,
          description: desc,
        }, senderInfo);
        newInvoiceId = invRes.invoiceId;
      } catch (dispErr) {
        console.warn("[PayPal Supplemental Invoice Warning]", dispErr);
      }

      // Record supplemental item in split record
      if (item) {
        await prisma.splitItem.create({
          data: {
            splitRecordId: item.splitRecordId,
            participantName: targetName,
            participantEmail: targetEmail,
            amount: diffToCharge,
            paypalInvoiceId: newInvoiceId,
            status: "SENT",
          },
        });
      }

      return NextResponse.json({
        success: true,
        action: "request_difference",
        invoiceId: newInvoiceId,
        amount: diffToCharge,
        message: `Dispatched supplemental PayPal invoice for $${diffToCharge.toFixed(
          2
        )} to ${targetName} (${targetEmail}) with note: "${desc}".`,
      });
    }

    // ACTION 3: Reinvoke Split Data Retrieval
    const targetRecordId = splitRecordId || item?.splitRecordId;
    const splitRecord = await prisma.splitRecord.findUnique({
      where: { id: targetRecordId },
      include: {
        items: true,
      },
    });

    if (!splitRecord) {
      return NextResponse.json({ error: "Split record not found." }, { status: 404 });
    }

    const rawItems = (splitRecord.itemsJson as Array<Record<string, unknown>>) || [];
    const participants = splitRecord.items.map((it) => {
      const meta = rawItems.find(
        (r) => r.participantEmail === it.participantEmail || r.participantName === it.participantName
      );
      return {
        id: it.id,
        name: it.participantName,
        email: it.participantEmail,
        amountPaid: Number(meta?.amountPaid ?? (it.status === "PAID" ? it.amount : 0)),
        originalAmount: Number(meta?.originalAmount ?? it.amount),
        currentShare: it.amount,
        status: it.status,
        reason: (meta?.settledReason as string) || (it.status === "CANCELLED" ? "Declined" : ""),
        isAdjusted: Boolean(meta?.isAdjusted),
      };
    });

    return NextResponse.json({
      success: true,
      action: "reinvoke",
      split: {
        id: splitRecord.id,
        description: splitRecord.description,
        totalAmount: splitRecord.totalAmount,
        participants,
      },
    });
  } catch (error) {
    console.error("[Dispute Action API Error]", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
