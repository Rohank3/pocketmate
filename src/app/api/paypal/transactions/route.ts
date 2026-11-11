import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { getUserLedgerTransactions } from "@/lib/paypal/sync";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { loadUserCategorizationContext, categorizeTransactionsBatch } from "@/lib/services/categorizer";
import type { TransactionRow } from "@/components/grid/TransactionGrid";
import { z } from "zod";

const TransactionsQuerySchema = z.object({
  hoursBack: z.coerce.number().finite().min(0.5).max(26280).optional(),
  scope: z.enum(["personal", "all"]).optional(),
  sync: z.enum(["true", "false"]).optional(),
});

function formatDisplayDate(timestamp: string): string {
  const dateObj = new Date(timestamp);
  const isToday = new Date().toDateString() === dateObj.toDateString();
  const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return isToday
    ? `Today, ${timeStr}`
    : `${dateObj.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active PayPal session required.", transactions: [] },
        { status: 401 }
      );
    }

    const rawHours = req.nextUrl.searchParams.get("hoursBack");
    const rawScope = req.nextUrl.searchParams.get("scope");
    const rawSync = req.nextUrl.searchParams.get("sync");

    const queryParse = TransactionsQuerySchema.safeParse({
      hoursBack: rawHours ?? undefined,
      scope: rawScope ?? undefined,
      sync: rawSync ?? undefined,
    });

    const hoursBack = queryParse.success ? queryParse.data.hoursBack : undefined;
    const scopeParam = queryParse.success ? queryParse.data.scope : undefined;
    const shouldSync = queryParse.success ? queryParse.data.sync !== "false" : true;

    const userRecord = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, email: true, name: true, persona: true, industry: true },
    });

    if (!userRecord) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: User account not found.", transactions: [] },
        { status: 401 }
      );
    }

    const isBusiness = userRecord.persona === "BUSINESS" || Boolean(userRecord.industry);
    const activeScope = isBusiness && scopeParam === "all" ? "all" : "personal";

    const txs =
      activeScope === "all"
        ? await paypalClient.fetchRecentTransactions(hoursBack ?? 720)
        : await getUserLedgerTransactions(userRecord.id, userRecord.email, {
            sync: shouldSync,
            hoursBack,
          });

    const scopedTxs = txs.filter((t) => t.status !== "CANCELLED");

    const catContext = await loadUserCategorizationContext(userRecord.id);
    const overrideLookupMap = new Map<string, string>();
    for (const o of catContext.overrides ?? []) {
      overrideLookupMap.set(o.transactionId, o.categoryName);
    }

    const categoryMap = await categorizeTransactionsBatch(
      scopedTxs.map((t) => ({
        id: t.id,
        merchantName: t.merchantName,
        amount: t.amount,
        note: t.memo,
      })),
      catContext
    );

    const formatted: TransactionRow[] = scopedTxs.map((t) => {
      let rowStatus: "settled" | "pending" | "disputed" | "unresolved" = "pending";
      if (t.status === "COMPLETED") rowStatus = "settled";
      else if (t.status === "PENDING" || t.status === "DRAFT") rowStatus = "pending";
      else if (t.status === "DISPUTED") rowStatus = "disputed";

      const direction =
        t.direction ||
        (t.isOutgoingSplit && t.status === "COMPLETED"
          ? "incoming"
          : t.isOutgoingSplit
          ? "outgoing_split"
          : "outgoing");

      const catEntry = categoryMap.get(t.id);
      let category = catEntry?.category || "Uncategorized";
      if (direction === "incoming" && (!catEntry || category === "Uncategorized") && !t.isOutgoingSplit) {
        category = "Income";
      }

      return {
        id: t.id,
        date: formatDisplayDate(t.timestamp),
        merchant: t.merchantName,
        memo: t.memo,
        category,
        debtor_name: t.debtorName || "",
        amount: t.amount,
        status: rowStatus,
        direction,
        isOutgoingSplit: t.isOutgoingSplit,
      };
    });

    const existingInvoiceIds = new Set(formatted.map((r) => r.id));

    // Include settled SplitItem records that aren't already represented by a synced PayPal invoice
    const settledItems = await prisma.splitItem.findMany({
      where: {
        status: "PAID",
        splitRecord: { userId: userRecord.id },
      },
      include: {
        splitRecord: true,
      },
      orderBy: { createdAt: "desc" },
    });

    for (const item of settledItems) {
      if (item.paypalInvoiceId && existingInvoiceIds.has(item.paypalInvoiceId)) {
        continue;
      }

      const rawItems = (item.splitRecord.itemsJson as Array<Record<string, unknown>>) || [];
      const meta = rawItems.find(
        (r) =>
          r.participantEmail === item.participantEmail ||
          r.participantName === item.participantName
      );

      const settledReason =
        (meta?.settledReason as string) ||
        (item.splitRecord.description ? `${item.splitRecord.description} split share` : "");

      let reasonMemo = `${item.splitRecord.description} split settlement`;
      if (settledReason && !settledReason.toLowerCase().includes("paid in full")) {
        reasonMemo += ` — ${settledReason}`;
      }

      const timestampIso = meta?.settledAt
        ? String(meta.settledAt)
        : item.createdAt.toISOString();

      const explicitOverride =
        overrideLookupMap.get(`stl_${item.id}`) ||
        overrideLookupMap.get(item.id) ||
        (item.paypalInvoiceId ? overrideLookupMap.get(item.paypalInvoiceId) : undefined);

      const category = explicitOverride || "Income";

      formatted.unshift({
        id: `stl_${item.id}`,
        date: formatDisplayDate(timestampIso),
        merchant: `${item.participantName} • ${item.splitRecord.description}`,
        memo: reasonMemo,
        category,
        debtor_name: item.participantName,
        amount: item.amount,
        status: "settled",
        direction: "incoming",
        isOutgoingSplit: true,
      });
    }

    return NextResponse.json({
      success: true,
      count: formatted.length,
      totalPlatformCount: formatted.length,
      activeScope,
      userRole: isBusiness ? "BUSINESS" : "PERSONAL",
      currentUser: { name: userRecord.name, email: userRecord.email },
      transactions: formatted,
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[PayPal Transactions Route Error]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch PayPal transactions", transactions: [] },
      { status: 500 }
    );
  }
}
