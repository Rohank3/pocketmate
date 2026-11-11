import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getUserLedgerTransactions, syncUserPayPalLedger } from "@/lib/paypal/sync";
import { reconcileAutopaySubscriptions } from "@/lib/services/autopayReconciliation";
import { loadUserCategorizationContext, categorizeTransactionsBatch } from "@/lib/services/categorizer";

let lastSyncTimestamp = 0;

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required." },
        { status: 401 }
      );
    }

    const now = Date.now();
    if (now - lastSyncTimestamp < 5000) {
      return NextResponse.json(
        { error: "Please wait a few seconds before resyncing PayPal data." },
        { status: 429 }
      );
    }
    lastSyncTimestamp = now;

    // Run incremental sync from the user's private checkpoint (or full backfill on first sync)
    await syncUserPayPalLedger(authUser.id, authUser.email);
    await reconcileAutopaySubscriptions(authUser.id, authUser.email);

    const rawTxs = await getUserLedgerTransactions(authUser.id, authUser.email, { sync: false });
    const catContext = await loadUserCategorizationContext(authUser.id);
    const categoryMap = await categorizeTransactionsBatch(
      rawTxs.map((t) => ({ id: t.id, merchantName: t.merchantName, amount: t.amount, note: t.memo })),
      catContext
    );

    const formatted = rawTxs.map((t) => {
      const dateObj = new Date(t.timestamp);
      const isToday = new Date().toDateString() === dateObj.toDateString();
      const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const displayDate = isToday
        ? `Today, ${timeStr}`
        : `${dateObj.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;

      const catEntry = categoryMap.get(t.id);
      const category = catEntry?.category || "Uncategorized";

      let rowStatus: "settled" | "pending" | "disputed" | "unresolved" = "pending";
      if (t.status === "COMPLETED") rowStatus = "settled";
      else if (t.status === "PENDING" || t.status === "DRAFT") rowStatus = "pending";
      else if (t.status === "DISPUTED") rowStatus = "disputed";

      return {
        id: t.id,
        date: displayDate,
        merchant: t.merchantName,
        memo: t.memo,
        category,
        debtor_name: t.debtorName || "",
        amount: t.amount,
        status: rowStatus,
        direction: t.direction,
        isOutgoingSplit: t.isOutgoingSplit,
      };
    });

    return NextResponse.json({
      success: true,
      message: "Synchronized your PayPal transactions.",
      transactions: formatted,
    });
  } catch (error) {
    console.error("[PayPal Sync Error]", error);
    return NextResponse.json(
      { success: false, error: "Failed to synchronize PayPal transactions" },
      { status: 500 }
    );
  }
}
