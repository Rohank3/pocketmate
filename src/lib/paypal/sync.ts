import { prisma } from "@/lib/db";
import { paypalClient, PayPalTransaction } from "./client";

const inFlightSyncs = new Map<string, Promise<void>>();

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const INCREMENTAL_OVERLAP_MS = 60 * 60 * 1000;
const DEFAULT_STALENESS_MS = 15 * 1000;

/**
 * Synchronizes a user's PayPal transactions into PostgreSQL (`LedgerTransaction`).
 * - On initial login (`user.lastSyncedAt === null`), pulls full PayPal history
 *   (walking 31-day Reporting windows up to 3 years + all Invoicing pages with detail hydration)
 *   and stores the private sync checkpoint on `User`.
 * - On subsequent calls, queries only incremental updates since the checkpoint plus status
 *   updates for any previously non-terminal invoices.
 */
export async function syncUserPayPalLedger(
  userId: string,
  userEmail: string,
  options?: { forceFull?: boolean }
): Promise<void> {
  if (!userId || !userEmail) return;

  const existingPromise = inFlightSyncs.get(userId);
  if (existingPromise) {
    await existingPromise;
    return;
  }

  const runSync = async () => {
    const cleanEmail = userEmail.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        lastSyncedAt: true,
        lastTransactionAt: true,
        lastTransactionId: true,
        paypalMerchantId: true,
        paypalOnboardingStatus: true,
      },
    });

    if (!user) return;

    const isFirstSync = Boolean(options?.forceFull || !user.lastSyncedAt);

    // Build set of PayPal invoice IDs known to belong to PocketMate split items
    const splitItems = await prisma.splitItem.findMany({
      where: {
        paypalInvoiceId: { not: null },
        OR: [
          { splitRecord: { userId } },
          { participantEmail: cleanEmail },
        ],
      },
      select: { paypalInvoiceId: true },
    });
    const knownSplitInvoiceIds = new Set<string>(
      splitItems.map((s) => s.paypalInvoiceId).filter((id): id is string => Boolean(id))
    );

    let existingTerminalInvoiceIds: Set<string> | undefined = undefined;
    const pendingInvoiceIdsToRefresh: string[] = [];

    if (!isFirstSync) {
      const existingInvoiceRows = await prisma.ledgerTransaction.findMany({
        where: { userId, sourceType: "invoice" },
        select: { paypalId: true, status: true },
      });

      existingTerminalInvoiceIds = new Set<string>();
      for (const row of existingInvoiceRows) {
        if (row.status === "COMPLETED" || row.status === "CANCELLED") {
          existingTerminalInvoiceIds.add(row.paypalId);
        } else {
          pendingInvoiceIdsToRefresh.push(row.paypalId);
        }
      }
    }

    const endDate = new Date();
    const startDate = isFirstSync
      ? new Date(endDate.getTime() - THREE_YEARS_MS)
      : new Date(user.lastSyncedAt!.getTime() - INCREMENTAL_OVERLAP_MS);

    const sinceCreateTime = isFirstSync
      ? undefined
      : new Date(user.lastSyncedAt!.getTime() - INCREMENTAL_OVERLAP_MS);

    const connectedMerchantId =
      user.paypalOnboardingStatus === "CONNECTED" && user.paypalMerchantId
        ? user.paypalMerchantId
        : undefined;

    const [reportingTxs, invoiceTxs] = await Promise.all([
      paypalClient.fetchReportingTransactionsWindow(startDate, endDate, cleanEmail, connectedMerchantId),
      paypalClient.fetchInvoices({
        filterEmail: cleanEmail,
        knownSplitInvoiceIds,
        existingTerminalInvoiceIds,
        pendingInvoiceIdsToRefresh,
        sinceCreateTime,
        maxPages: isFirstSync ? 25 : 5,
      }),
    ]);

    const returnedInvoiceIds = new Set(invoiceTxs.map((t) => t.id));
    const knownInvoiceIds = new Set<string>(returnedInvoiceIds);
    if (existingTerminalInvoiceIds) {
      for (const id of existingTerminalInvoiceIds) knownInvoiceIds.add(id);
    }
    for (const id of pendingInvoiceIdsToRefresh) knownInvoiceIds.add(id);

    const dedupedReportingTxs = reportingTxs.filter(
      (tx) => !tx.relatedInvoiceId || !knownInvoiceIds.has(tx.relatedInvoiceId)
    );

    const combined = [...dedupedReportingTxs, ...invoiceTxs];

    for (const tx of combined) {
      const txTimestamp = new Date(tx.timestamp);
      const validTimestamp = Number.isNaN(txTimestamp.getTime()) ? new Date() : txTimestamp;

      await prisma.ledgerTransaction.upsert({
        where: {
          userId_paypalId: {
            userId,
            paypalId: tx.id,
          },
        },
        update: {
          sourceType: tx.sourceType || "invoice",
          txType: tx.txType || "merchant",
          status: tx.status,
          amount: tx.amount,
          currency: tx.currency || "USD",
          merchantName: tx.merchantName,
          memo: tx.memo ?? null,
          timestamp: validTimestamp,
          feeAmount: tx.feeAmount ?? null,
          debtorName: tx.debtorName ?? null,
          recipientEmail: tx.recipientEmail ?? null,
          invoicerEmail: tx.invoicerEmail ?? null,
          direction: tx.direction || "outgoing",
          isOutgoingSplit: Boolean(tx.isOutgoingSplit),
        },
        create: {
          userId,
          paypalId: tx.id,
          sourceType: tx.sourceType || "invoice",
          txType: tx.txType || "merchant",
          status: tx.status,
          amount: tx.amount,
          currency: tx.currency || "USD",
          merchantName: tx.merchantName,
          memo: tx.memo ?? null,
          timestamp: validTimestamp,
          feeAmount: tx.feeAmount ?? null,
          debtorName: tx.debtorName ?? null,
          recipientEmail: tx.recipientEmail ?? null,
          invoicerEmail: tx.invoicerEmail ?? null,
          direction: tx.direction || "outgoing",
          isOutgoingSplit: Boolean(tx.isOutgoingSplit),
        },
      });
    }

    // Mark previously pending invoices that disappeared (cancelled/refunded) as CANCELLED locally
    if (pendingInvoiceIdsToRefresh.length > 0) {
      const cancelledIds: string[] = [];
      for (const pendingId of pendingInvoiceIdsToRefresh) {
        if (!returnedInvoiceIds.has(pendingId)) {
          const detail = await paypalClient.fetchInvoiceDetails(pendingId);
          const rawStatus = String(detail?.status || "").toUpperCase();
          if (rawStatus.includes("CANCEL") || rawStatus.includes("REFUND")) {
            cancelledIds.push(pendingId);
          }
        }
      }
      if (cancelledIds.length > 0) {
        await prisma.ledgerTransaction.updateMany({
          where: { userId, paypalId: { in: cancelledIds } },
          data: { status: "CANCELLED" },
        });
      }
    }

    const latestRecord = await prisma.ledgerTransaction.findFirst({
      where: { userId, status: { not: "CANCELLED" } },
      orderBy: { timestamp: "desc" },
      select: { paypalId: true, timestamp: true },
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastSyncedAt: new Date(),
        lastTransactionAt: latestRecord?.timestamp ?? user.lastTransactionAt ?? null,
        lastTransactionId: latestRecord?.paypalId ?? user.lastTransactionId ?? null,
      },
    });
  };

  const promise = runSync().finally(() => {
    inFlightSyncs.delete(userId);
  });
  inFlightSyncs.set(userId, promise);
  await promise;
}

/**
 * Returns the authenticated user's persisted transactions from PostgreSQL,
 * automatically running a full-history backfill on first login or an incremental
 * sync since the private checkpoint when stale.
 */
export async function getUserLedgerTransactions(
  userId: string,
  userEmail: string,
  options?: {
    sync?: boolean;
    forceFull?: boolean;
    hoursBack?: number;
    maxStalenessMs?: number;
  }
): Promise<PayPalTransaction[]> {
  if (!userId || !userEmail) return [];

  if (options?.sync !== false) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastSyncedAt: true },
    });

    const stalenessMs = options?.maxStalenessMs ?? DEFAULT_STALENESS_MS;
    const needsSync =
      Boolean(options?.forceFull) ||
      !user?.lastSyncedAt ||
      Date.now() - user.lastSyncedAt.getTime() >= stalenessMs;

    if (needsSync) {
      try {
        await syncUserPayPalLedger(userId, userEmail, { forceFull: options?.forceFull });
      } catch (err) {
        console.warn("[Ledger Incremental Sync Warning]", err);
      }
    }
  }

  const minDate = options?.hoursBack
    ? new Date(Date.now() - options.hoursBack * 60 * 60 * 1000)
    : undefined;

  const rows = await prisma.ledgerTransaction.findMany({
    where: {
      userId,
      status: { not: "CANCELLED" },
      ...(minDate ? { timestamp: { gte: minDate } } : {}),
    },
    orderBy: { timestamp: "desc" },
  });

  return rows.map((r) => ({
    id: r.paypalId,
    status: r.status,
    amount: r.amount,
    currency: r.currency,
    merchantName: r.merchantName,
    memo: r.memo ?? undefined,
    sourceType: r.sourceType as "reporting" | "invoice",
    txType: r.txType as "merchant" | "p2p" | "split",
    timestamp: r.timestamp.toISOString(),
    feeAmount: r.feeAmount ?? undefined,
    debtorName: r.debtorName ?? undefined,
    recipientEmail: r.recipientEmail ?? undefined,
    invoicerEmail: r.invoicerEmail ?? undefined,
    direction: r.direction as "incoming" | "outgoing" | "outgoing_split",
    isOutgoingSplit: r.isOutgoingSplit,
  }));
}

/**
 * Nudges recipient sync checkpoints and refreshes the organizer's ledger after
 * dispatching or re-issuing split invoices.
 */
export async function syncLedgerAfterDispatch(
  userId: string | undefined,
  senderEmail: string | undefined,
  recipientEmails: string[]
): Promise<void> {
  if (!userId) return;

  const cleanRecipients = Array.from(
    new Set(recipientEmails.map((e) => e.toLowerCase().trim()).filter(Boolean))
  );
  if (cleanRecipients.length > 0) {
    try {
      await prisma.user.updateMany({
        where: {
          email: { in: cleanRecipients },
          lastSyncedAt: { not: null },
        },
        data: {
          lastSyncedAt: new Date(Date.now() - 60_000),
        },
      });
    } catch {
      // ignore recipient checkpoint nudge failure
    }
  }

  if (senderEmail) {
    try {
      await syncUserPayPalLedger(userId, senderEmail);
    } catch (syncErr) {
      console.warn("[Post-Dispatch Ledger Sync Warning]", syncErr);
    }
  }
}
