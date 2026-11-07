import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { verifySessionCookie } from "@/lib/auth/session";
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

    // Determine account role
    const isBusiness =
      userEmail.includes("business") ||
      userEmail.includes("merchant") ||
      userEmail.includes("retail") ||
      userEmail.includes("studio") ||
      userEmail.includes("ventures");

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

    const scopedTxs = txs;

    // Map to TransactionRow format expected by the frontend
    const formatted = scopedTxs.map((t) => {
      const dateObj = new Date(t.timestamp);
      const isToday = new Date().toDateString() === dateObj.toDateString();
      const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const displayDate = isToday ? `Today, ${timeStr}` : `${dateObj.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;

      // Infer clean category
      let category = "General";
      const m = t.merchantName.toLowerCase();
      if (m.includes("bar") || m.includes("diner") || m.includes("coffee") || m.includes("bistro") || m.includes("dining")) {
        category = "Dining";
      } else if (m.includes("lane") || m.includes("bowling") || m.includes("movie") || m.includes("entertainment")) {
        category = "Entertainment";
      } else if (m.includes("zara") || m.includes("mall") || m.includes("shopping")) {
        category = "Shopping";
      } else if (m.includes("target") || m.includes("grocer") || m.includes("market") || m.includes("food")) {
        category = "Groceries";
      } else if (m.includes("transit") || m.includes("metro") || m.includes("flight") || m.includes("travel")) {
        category = "Travel";
      }

      let rowStatus: "settled" | "pending" | "disputed" | "unresolved" = "pending";
      if (t.status === "COMPLETED") rowStatus = "settled";
      else if (t.status === "PENDING" || t.status === "DRAFT") rowStatus = "pending";
      else if (t.status === "DISPUTED") rowStatus = "disputed";

      return {
        id: t.id,
        date: displayDate,
        merchant: t.merchantName,
        category,
        debtor_name: t.debtorName || "Self",
        amount: t.amount,
        status: rowStatus,
      };
    });

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
