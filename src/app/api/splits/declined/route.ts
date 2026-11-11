import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { paypalClient, type InvoiceDispatchResult } from "@/lib/paypal/client";
import { syncLedgerAfterDispatch } from "@/lib/paypal/sync";

const DeclinedSplitActionSchema = z.object({
  splitRecordId: z.string().trim().min(1),
  splitItemId: z.string().trim().optional(),
  invoiceId: z.string().trim().optional(),
  participantEmail: z.string().trim().optional(),
  participantName: z.string().trim().optional(),
  action: z.enum(["dismiss", "ask_again"]),
  adjustedAmount: z.number().finite().positive().max(50000).optional(),
  note: z.string().trim().max(500).optional(),
});

function upsertSplitMetaEntry(
  rawItems: Array<Record<string, unknown>>,
  matcher: {
    invoiceId?: string;
    email?: string;
    name?: string;
  },
  patch: Record<string, unknown>
): Array<Record<string, unknown>> {
  const cleanInv = matcher.invoiceId?.trim() || "";
  const cleanEmail = matcher.email?.toLowerCase().trim() || "";
  const cleanName = matcher.name?.toLowerCase().trim() || "";

  let matched = false;
  const next = rawItems.map((entry) => {
    const entryInv = typeof entry.invoiceId === "string" ? entry.invoiceId.trim() : "";
    const entryEmail =
      typeof entry.participantEmail === "string"
        ? entry.participantEmail.toLowerCase().trim()
        : "";
    const entryName =
      typeof entry.participantName === "string"
        ? entry.participantName.toLowerCase().trim()
        : "";

    const isMatch =
      (cleanInv && entryInv === cleanInv) ||
      (!matched &&
        ((cleanEmail && entryEmail === cleanEmail) ||
          (cleanName && entryName === cleanName)));

    if (isMatch) {
      matched = true;
      return { ...entry, ...patch };
    }
    return entry;
  });

  if (!matched) {
    next.push({
      participantName: matcher.name || "Participant",
      participantEmail: matcher.email || "",
      ...(matcher.invoiceId ? { invoiceId: matcher.invoiceId } : {}),
      ...patch,
    });
  }

  return next;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required." },
        { status: 401 }
      );
    }

    const rawBody = await req.json();
    const parsed = DeclinedSplitActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const {
      splitRecordId,
      splitItemId,
      invoiceId,
      participantEmail,
      participantName,
      action,
      adjustedAmount,
      note,
    } = parsed.data;

    const splitRecord = await prisma.splitRecord.findFirst({
      where: {
        id: splitRecordId,
        userId: authUser.id,
      },
      include: {
        items: true,
      },
    });

    if (!splitRecord) {
      return NextResponse.json(
        { error: "Split record not found or access denied." },
        { status: 404 }
      );
    }

    const emailLower = participantEmail?.toLowerCase().trim();
    const nameLower = participantName?.toLowerCase().trim();

    const targetItem =
      splitRecord.items.find((it) => splitItemId && it.id === splitItemId) ||
      splitRecord.items.find((it) => invoiceId && it.paypalInvoiceId === invoiceId) ||
      splitRecord.items.find(
        (it) =>
          it.status === "CANCELLED" &&
          ((emailLower && (it.participantEmail || "").toLowerCase().trim() === emailLower) ||
            (nameLower && it.participantName.toLowerCase().trim() === nameLower))
      ) ||
      splitRecord.items.find(
        (it) =>
          (emailLower && (it.participantEmail || "").toLowerCase().trim() === emailLower) ||
          (nameLower && it.participantName.toLowerCase().trim() === nameLower)
      );

    const resolvedName =
      targetItem?.participantName || participantName || "Participant";
    const resolvedEmail =
      (targetItem?.participantEmail || participantEmail || "").trim();
    const resolvedInvoiceId =
      targetItem?.paypalInvoiceId || invoiceId || undefined;

    const rawItems = Array.isArray(splitRecord.itemsJson)
      ? ([...splitRecord.itemsJson] as Array<Record<string, unknown>>)
      : [];

    if (action === "dismiss") {
      const updatedItemsJson = upsertSplitMetaEntry(
        rawItems,
        {
          invoiceId: resolvedInvoiceId,
          email: resolvedEmail,
          name: resolvedName,
        },
        {
          participantName: resolvedName,
          participantEmail: resolvedEmail,
          ...(targetItem ? { amount: targetItem.amount, status: targetItem.status } : {}),
          actionRequiredDismissed: true,
          dismissedAt: new Date().toISOString(),
        }
      );

      await prisma.splitRecord.update({
        where: { id: splitRecord.id },
        data: {
          itemsJson: updatedItemsJson as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json({
        success: true,
        action: "dismiss",
        message: `Dismissed declined invoice alert for ${resolvedName}.`,
      });
    }

    // action === "ask_again"
    if (!resolvedEmail || !resolvedEmail.includes("@")) {
      return NextResponse.json(
        { error: "Participant PayPal email is required to send a new invoice." },
        { status: 400 }
      );
    }

    const baseAmount =
      adjustedAmount !== undefined ? adjustedAmount : targetItem?.amount ?? 0;
    const roundedAmount = Math.round(baseAmount * 100) / 100;
    if (!(roundedAmount > 0)) {
      return NextResponse.json(
        { error: "Invoice amount must be greater than zero." },
        { status: 400 }
      );
    }

    const invoiceDescription =
      note?.trim() || `${splitRecord.description || "Shared Split"} (Revised request)`;
    const senderInfo = {
      name: authUser.name || authUser.email.split("@")[0].replace(/[._]/g, " "),
      email: authUser.email,
    };

    let dispatched: InvoiceDispatchResult;
    try {
      dispatched = await paypalClient.dispatchInvoice(
        {
          email: resolvedEmail,
          name: resolvedName,
          amount: roundedAmount,
          description: invoiceDescription,
        },
        senderInfo
      );
    } catch (dispErr: unknown) {
      const message =
        dispErr instanceof Error
          ? dispErr.message
          : "PayPal rejected dispatching the revised invoice.";
      console.error("[Declined Split Ask Again Error]", dispErr);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (targetItem) {
      await prisma.splitItem.update({
        where: { id: targetItem.id },
        data: {
          amount: roundedAmount,
          paypalInvoiceId: dispatched.invoiceId,
          status: "SENT",
        },
      });
    } else {
      await prisma.splitItem.create({
        data: {
          splitRecordId: splitRecord.id,
          participantName: resolvedName,
          participantEmail: resolvedEmail,
          amount: roundedAmount,
          paypalInvoiceId: dispatched.invoiceId,
          status: "SENT",
        },
      });
    }

    const refreshedItems = await prisma.splitItem.findMany({
      where: { splitRecordId: splitRecord.id },
      select: { amount: true },
    });
    const nextTotal =
      Math.round(
        refreshedItems.reduce((sum, it) => sum + Number(it.amount || 0), 0) * 100
      ) / 100;

    const updatedItemsJson = upsertSplitMetaEntry(
      rawItems,
      {
        invoiceId: resolvedInvoiceId,
        email: resolvedEmail,
        name: resolvedName,
      },
      {
        participantName: resolvedName,
        participantEmail: resolvedEmail,
        amount: roundedAmount,
        originalAmount: roundedAmount,
        amountPaid: 0,
        difference: 0,
        status: "SENT",
        isAdjusted: false,
        settledReason: note?.trim() || null,
        invoiceId: dispatched.invoiceId,
        previousDeclinedInvoiceId: resolvedInvoiceId || null,
        previousDeclinedAmount: targetItem?.amount ?? roundedAmount,
        actionRequiredDismissed: true,
        reaskedAt: new Date().toISOString(),
      }
    );

    await prisma.splitRecord.update({
      where: { id: splitRecord.id },
      data: {
        totalAmount: nextTotal > 0 ? nextTotal : roundedAmount,
        status: "SENT",
        itemsJson: updatedItemsJson as unknown as Prisma.InputJsonValue,
      },
    });

    await syncLedgerAfterDispatch(authUser.id, authUser.email, [resolvedEmail]);

    return NextResponse.json({
      success: true,
      action: "ask_again",
      invoiceId: dispatched.invoiceId,
      paypalInvoiceUrl: dispatched.viewUrl,
      amount: roundedAmount,
      message: `Sent revised $${roundedAmount.toFixed(2)} PayPal invoice to ${resolvedName}.`,
    });
  } catch (error) {
    console.error("[Declined Split Action API Error]", error);
    return NextResponse.json(
      { error: "Failed to process declined split action." },
      { status: 500 }
    );
  }
}
