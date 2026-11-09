import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { verifySessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { loadUserCategorizationContext, categorizeTransactionsBatch } from "@/lib/services/categorizer";
import type { TransactionRow } from "@/components/grid/TransactionGrid";
import { z } from "zod";

const TransactionsQuerySchema = z.object({
  hoursBack: z.coerce.number().finite().min(0.5).max(720).default(720),
  scope: z.enum(["personal", "all"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const rawHours = req.nextUrl.searchParams.get("hoursBack");
    const rawScope = req.nextUrl.searchParams.get("scope");

    const queryParse = TransactionsQuerySchema.safeParse({
      hoursBack: rawHours ?? undefined,
      scope: rawScope ?? undefined,
    });

    const hoursBack = queryParse.success ? queryParse.data.hoursBack : 720;
    const scopeParam = queryParse.success ? queryParse.data.scope : undefined;

    // Inspect logged-in user from session cookie
    const userCookie = req.cookies.get("pocketmate_user")?.value;
    const verified = verifySessionCookie(userCookie);
    const userEmail = verified?.email || "";

    if (!userEmail) {
      return NextResponse.json({
        success: true,
        count: 0,
        totalPlatformCount: 0,
        activeScope: "personal",
        userRole: "GUEST",
        currentUser: null,
        transactions: [],
      });
    }

    // Determine account role strictly via database persona and registered industry (no email sniffing)
    const userRecord = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, persona: true, industry: true },
    });
    const isBusiness = userRecord?.persona === "BUSINESS" || Boolean(userRecord?.industry);

    // Scope enforcement: personal accounts are strictly restricted to their own transactions
    const activeScope = isBusiness && scopeParam === "all" ? "all" : "personal";

    // Query PayPal live APIs - if personal scope, query strictly for this user
    const queryEmail = activeScope === "personal" ? userEmail : undefined;
    const txs = await paypalClient.fetchRecentTransactions(hoursBack, queryEmail);

    // Also get total platform count if in personal mode
    let totalPlatformCount = txs.length;
    if (activeScope === "personal") {
      try {
        const allTxs = await paypalClient.fetchRecentTransactions(hoursBack);
        totalPlatformCount = allTxs.length;
      } catch {
        // fallback
      }
    }

    const scopedTxs = txs.filter((t) => t.status !== "CANCELLED");

    // Load dynamic categorization context (user categories, merchant rules, overrides)
    const userId = userRecord?.id || verified?.id;

    let categoryMap = new Map<string, { category: string }>();
    const overrideLookupMap = new Map<string, string>();
    if (userId) {
      try {
        const catContext = await loadUserCategorizationContext(userId);
        for (const o of catContext.overrides ?? []) {
          overrideLookupMap.set(o.transactionId, o.categoryName);
        }
        categoryMap = await categorizeTransactionsBatch(
          scopedTxs.map((t) => ({ id: t.id, merchantName: t.merchantName, amount: t.amount })),
          catContext
        );
      } catch (catErr) {
        console.warn("[Transactions Route Categorizer Warning]", catErr);
      }
    }

    // Map to TransactionRow format expected by the frontend
    const formatted: TransactionRow[] = scopedTxs.map((t) => {
      const dateObj = new Date(t.timestamp);
      const isToday = new Date().toDateString() === dateObj.toDateString();
      const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const displayDate = isToday ? `Today, ${timeStr}` : `${dateObj.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;

      const catEntry = categoryMap.get(t.id);
      const category = catEntry?.category || "Uncategorized";

      let rowStatus: "settled" | "pending" | "disputed" | "unresolved" = "pending";
      if (t.status === "COMPLETED") rowStatus = "settled";
      else if (t.status === "PENDING" || t.status === "DRAFT") rowStatus = "pending";
      else if (t.status === "DISPUTED") rowStatus = "disputed";

      const isSplit =
        t.splitAllocation === "split" ||
        Boolean(t.memo && (t.memo.toLowerCase().includes("split") || t.memo.toLowerCase().includes("share"))) ||
        t.merchantName.toLowerCase().includes("split");

      const debtorDisplay = isSplit
        ? t.debtorName && !t.debtorName.toLowerCase().includes("self") && t.debtorName !== "Shared Split"
          ? t.debtorName
          : "Shared Split"
        : "100% Self";

      const direction =
        t.direction ||
        (t.isOutgoingSplit && t.status === "COMPLETED"
          ? "incoming"
          : t.isOutgoingSplit
          ? "outgoing_split"
          : "outgoing");

      return {
        id: t.id,
        date: displayDate,
        merchant: t.merchantName,
        memo: t.memo,
        splitAllocation: isSplit ? "split" : "self",
        category,
        debtor_name: debtorDisplay,
        amount: t.amount,
        status: rowStatus,
        direction,
        isOutgoingSplit: t.isOutgoingSplit,
      };
    });

    // Query settled split reimbursements received by this organizer and prepend to ledger
    if (userId) {
      try {
        const settledItems = await prisma.splitItem.findMany({
          where: {
            status: "PAID",
            splitRecord: { userId },
          },
          include: {
            splitRecord: true,
          },
          orderBy: { createdAt: "desc" },
        });

        for (const item of settledItems) {
          const rawItems = (item.splitRecord.itemsJson as Array<Record<string, unknown>>) || [];
          const meta = rawItems.find(
            (r) =>
              r.participantEmail === item.participantEmail ||
              r.participantName === item.participantName
          );

          const settledReason =
            (meta?.settledReason as string) ||
            (item.splitRecord.description ? `${item.splitRecord.description} split share` : "");
          const isAdjusted = Boolean(meta?.isAdjusted);
          const origAmt = Number(meta?.originalAmount) || item.amount;

          let reasonMemo = `${item.splitRecord.description} split settlement`;
          if (settledReason && !settledReason.toLowerCase().includes("paid in full")) {
            reasonMemo += ` — Reason: "${settledReason}"`;
          }
          if (isAdjusted) {
            reasonMemo += ` (Adjusted from $${origAmt.toFixed(2)})`;
          }

          const dateObj = new Date(meta?.settledAt ? String(meta.settledAt) : item.createdAt);
          const isToday = new Date().toDateString() === dateObj.toDateString();
          const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const displayDate = isToday ? `Today, ${timeStr}` : `${dateObj.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;

          // Check if user explicitly overridden category for this settled transaction
          const explicitOverride =
            overrideLookupMap.get(`stl_${item.id}`) ||
            overrideLookupMap.get(item.id) ||
            (item.paypalInvoiceId ? overrideLookupMap.get(item.paypalInvoiceId) : undefined);

          let category = explicitOverride || "Personal Reimbursement";
          if (!explicitOverride) {
            // Inherit parent category (Travel, Dining, etc.) to offset category expense
            const desc = item.splitRecord.description.toLowerCase();
            if (desc.includes("hotel") || desc.includes("flight") || desc.includes("travel") || desc.includes("vista")) {
              category = "Travel";
            } else if (desc.includes("dinner") || desc.includes("bistro") || desc.includes("food") || desc.includes("dining")) {
              category = "Dining";
            } else if (desc.includes("grocer")) {
              category = "Groceries";
            }
          }

          formatted.unshift({
            id: `stl_${item.id}`,
            date: displayDate,
            merchant: item.participantName,
            memo: reasonMemo,
            splitAllocation: "split",
            category,
            debtor_name: `Split (${item.participantName})`,
            amount: item.amount,
            status: "settled",
            direction: "incoming",
          });
        }
      } catch (stlErr) {
        console.warn("[Settled Splits Query Warning]", stlErr);
      }
    }

    return NextResponse.json({
      success: true,
      count: formatted.length,
      totalPlatformCount,
      activeScope,
      userRole: isBusiness ? "BUSINESS" : "PERSONAL",
      currentUser: verified ? { name: verified.name, email: verified.email } : null,
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
