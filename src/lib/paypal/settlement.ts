import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { paypalClient } from "./client";
import { syncUserPayPalLedger } from "./sync";

export interface InvoiceSettlementContext {
  invoiceId: string;
  splitItemId?: string;
  payerUserId: string;
  payerName: string;
  payerEmail: string;
  action: "pay" | "decline";
  reason?: string;
  originalAmount?: number;
  memo?: string;
  senderName?: string;
  senderEmail?: string;
}

export async function resolveInvoiceParties(params: {
  invoiceId: string;
  splitItemId?: string;
  payerUserId: string;
  payerEmail: string;
  senderEmail?: string;
  senderName?: string;
}) {
  const { invoiceId, splitItemId, payerUserId, payerEmail, senderEmail, senderName } = params;

  let splitItem = splitItemId
    ? await prisma.splitItem.findUnique({
        where: { id: splitItemId },
        include: { splitRecord: { include: { user: true } } },
      })
    : null;

  if (!splitItem && invoiceId) {
    splitItem = await prisma.splitItem.findFirst({
      where: {
        OR: [{ paypalInvoiceId: invoiceId }, { id: invoiceId }],
      },
      include: { splitRecord: { include: { user: true } } },
    });
  }

  // Fallback lookup via payer's LedgerTransaction to resolve authentic organizer email & invoice
  const payerLedgerTx = invoiceId
    ? await prisma.ledgerTransaction.findFirst({
        where: {
          userId: payerUserId,
          OR: [{ paypalId: invoiceId }],
        },
      })
    : null;

  if (!splitItem && payerEmail) {
    splitItem = await prisma.splitItem.findFirst({
      where: {
        participantEmail: payerEmail.toLowerCase().trim(),
        status: { in: ["DRAFT", "SENT"] },
        ...(payerLedgerTx ? { amount: payerLedgerTx.amount } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { splitRecord: { include: { user: true } } },
    });
  }

  let organizerUser = splitItem?.splitRecord?.user || null;
  const candidateEmail = (
    senderEmail ||
    payerLedgerTx?.invoicerEmail ||
    organizerUser?.email ||
    ""
  )
    .toLowerCase()
    .trim();

  if (!organizerUser && candidateEmail) {
    organizerUser = await prisma.user.findUnique({ where: { email: candidateEmail } });
  }

  if (!organizerUser && senderName && senderName !== "Organizer") {
    organizerUser = await prisma.user.findFirst({
      where: { name: { contains: senderName, mode: "insensitive" } },
    });
  }

  const resolvedInvoiceId =
    splitItem?.paypalInvoiceId ||
    payerLedgerTx?.paypalId ||
    invoiceId;

  return {
    splitItem,
    payerLedgerTx,
    organizerUser,
    resolvedInvoiceId,
    resolvedSenderEmail: candidateEmail || organizerUser?.email || undefined,
    resolvedSenderName:
      organizerUser?.name ||
      senderName ||
      (candidateEmail ? candidateEmail.split("@")[0].replace(/[._]/g, " ") : "Organizer"),
  };
}

/**
 * Persists settlement or decline for a resolved invoice, updates PayPal Invoicing v2
 * (on paid settlements), refreshes both payer and organizer ledgers, and posts a chat
 * notification into the organizer's thread.
 */
export async function finalizeInvoiceResolution(ctx: InvoiceSettlementContext) {
  const parties = await resolveInvoiceParties({
    invoiceId: ctx.invoiceId,
    splitItemId: ctx.splitItemId,
    payerUserId: ctx.payerUserId,
    payerEmail: ctx.payerEmail,
    senderEmail: ctx.senderEmail,
    senderName: ctx.senderName,
  });

  const { splitItem, payerLedgerTx, organizerUser, resolvedInvoiceId } = parties;
  const effectiveOriginal =
    splitItem?.amount || payerLedgerTx?.amount || ctx.originalAmount || 0;
  const effectivePaid = ctx.action === "pay" ? effectiveOriginal : 0;
  const effectiveDescription =
    splitItem?.splitRecord?.description ||
    payerLedgerTx?.memo ||
    payerLedgerTx?.merchantName ||
    ctx.memo ||
    "Split invoice";

  if (ctx.action === "pay" && resolvedInvoiceId.startsWith("INV2-") && effectiveOriginal > 0) {
    await paypalClient.recordInvoicePayment(
      resolvedInvoiceId,
      effectiveOriginal,
      `Paid in full by ${ctx.payerName} (${ctx.payerEmail})`
    );
  }

  if (splitItem) {
    const newStatus: "PAID" | "CANCELLED" = ctx.action === "decline" ? "CANCELLED" : "PAID";

    await prisma.splitItem.update({
      where: { id: splitItem.id },
      data: {
        status: newStatus,
        amount: effectivePaid > 0 ? effectivePaid : splitItem.amount,
      },
    });

    const rawItems = Array.isArray(splitItem.splitRecord.itemsJson)
      ? ([...splitItem.splitRecord.itemsJson] as Array<Record<string, unknown>>)
      : [];
    const resolvedMetaEntry = {
      participantName: splitItem.participantName,
      participantEmail: splitItem.participantEmail || ctx.payerEmail,
      amount: effectiveOriginal,
      amountPaid: effectivePaid,
      settledReason: ctx.reason || (ctx.action === "pay" ? "Paid in full" : "Declined"),
      status: newStatus,
      isAdjusted: false,
      originalAmount: effectiveOriginal,
      difference: Math.max(0, effectiveOriginal - effectivePaid),
      invoiceId: resolvedInvoiceId,
      settledAt: new Date().toISOString(),
      actionRequiredDismissed: newStatus === "CANCELLED" ? false : true,
    };

    let matchedExisting = false;
    const updatedItems = rawItems.map((item) => {
      const itemInvoiceId =
        typeof item.invoiceId === "string" ? item.invoiceId.trim() : "";
      const matchesInvoice = Boolean(itemInvoiceId && itemInvoiceId === resolvedInvoiceId);
      const matchesEmail =
        typeof item.participantEmail === "string" &&
        (item.participantEmail.toLowerCase() === ctx.payerEmail.toLowerCase() ||
          item.participantEmail.toLowerCase() === (splitItem.participantEmail || "").toLowerCase());
      const matchesName =
        typeof item.participantName === "string" &&
        item.participantName.toLowerCase() === splitItem.participantName.toLowerCase();

      if (matchesInvoice || (!itemInvoiceId && (matchesEmail || matchesName)) || (!matchedExisting && (matchesEmail || matchesName))) {
        matchedExisting = true;
        const baseOriginal = Number(item.originalAmount ?? item.amount) || effectiveOriginal;
        return {
          ...item,
          ...resolvedMetaEntry,
          originalAmount: baseOriginal,
          difference: Math.max(0, baseOriginal - effectivePaid),
        };
      }
      return item;
    });

    if (!matchedExisting) {
      updatedItems.push(resolvedMetaEntry);
    }

    const remainingUnpaid = await prisma.splitItem.count({
      where: {
        splitRecordId: splitItem.splitRecordId,
        status: { in: ["DRAFT", "SENT"] },
      },
    });

    await prisma.splitRecord.update({
      where: { id: splitItem.splitRecordId },
      data: {
        itemsJson: updatedItems as unknown as Prisma.InputJsonValue,
        status: remainingUnpaid === 0 ? "SETTLED" : "SENT",
      },
    });
  }

  // Update cached ledger rows immediately so UI stays consistent
  if (resolvedInvoiceId) {
    await prisma.ledgerTransaction.updateMany({
      where: { paypalId: resolvedInvoiceId },
      data: {
        status: ctx.action === "pay" ? "COMPLETED" : "CANCELLED",
        ...(ctx.action === "pay" ? {} : {}),
      },
    });
    if (ctx.action === "pay" && organizerUser) {
      await prisma.ledgerTransaction.updateMany({
        where: { userId: organizerUser.id, paypalId: resolvedInvoiceId },
        data: {
          status: "COMPLETED",
          direction: "incoming",
        },
      });
    }
  }

  // Build notification message for organizer's chat thread
  const notificationContent =
    ctx.action === "pay"
      ? `🎉 **${ctx.payerName}** settled their **$${effectiveOriginal.toFixed(
          2
        )}** invoice for **"${effectiveDescription}"** in full via PayPal Sandbox.\n\n• **Invoice ID**: \`${resolvedInvoiceId}\`\n• **Settlement**: $${effectiveOriginal.toFixed(
          2
        )} USD\n• **Status**: Settled`
      : `❌ **${ctx.payerName}** declined the invoice of **$${effectiveOriginal.toFixed(
          2
        )}** for **"${effectiveDescription}"**.\n\n• **Invoice ID**: \`${resolvedInvoiceId}\`\n• **Reason Provided**: "${
          ctx.reason || "No explanation provided"
        }"\n• **Status**: Declined`;

  if (organizerUser && organizerUser.id !== ctx.payerUserId) {
    let targetThread = await prisma.chatThread.findFirst({
      where: { userId: organizerUser.id },
      orderBy: { updatedAt: "desc" },
    });

    if (!targetThread) {
      targetThread = await prisma.chatThread.create({
        data: {
          userId: organizerUser.id,
          title: "Financial Activity & Invoicing",
        },
      });
    }

    const resolutionCardData =
      ctx.action === "decline"
        ? {
            action: "DISPUTE_RESOLUTION",
            type: "dispute_resolution",
            invoiceId: resolvedInvoiceId,
            splitItemId: splitItem?.id,
            splitRecordId: splitItem?.splitRecordId,
            splitDescription: effectiveDescription,
            payerName: ctx.payerName,
            payerEmail: ctx.payerEmail,
            originalAmount: effectiveOriginal,
            adjustedAmount: 0,
            difference: effectiveOriginal,
            reason: ctx.reason || "Declined invoice",
            status: "declined",
          }
        : null;

    await prisma.chatMessage.create({
      data: {
        userId: organizerUser.id,
        threadId: targetThread.id,
        role: "assistant",
        content: notificationContent,
        toolCallsJson: resolutionCardData
          ? ({ actionCard: resolutionCardData } as unknown as Prisma.InputJsonValue)
          : undefined,
        persona: "GENERAL",
      },
    });

    await prisma.chatThread.update({
      where: { id: targetThread.id },
      data: { updatedAt: new Date() },
    });
  }

  // Trigger fast incremental ledger sync for payer & organizer in background
  await Promise.allSettled([
    syncUserPayPalLedger(ctx.payerUserId, ctx.payerEmail),
    organizerUser ? syncUserPayPalLedger(organizerUser.id, organizerUser.email) : Promise.resolve(),
  ]);

  return {
    invoiceId: resolvedInvoiceId,
    amount: effectiveOriginal,
    description: effectiveDescription,
    organizerName: parties.resolvedSenderName,
  };
}
