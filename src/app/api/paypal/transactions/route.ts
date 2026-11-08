import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { verifySessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { loadUserCategorizationContext, categorizeTransactionsBatch } from "@/lib/services/categorizer";
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

    // Load dynamic categorization context (user categories, merchant rules, overrides)
    const userRecord = await prisma.user.findUnique({ where: { email: userEmail } });
    const userId = userRecord?.id || verified?.id;

    let categoryMap = new Map<string, { category: string }>();
    if (userId) {
      try {
        const catContext = await loadUserCategorizationContext(userId);
        categoryMap = await categorizeTransactionsBatch(
          scopedTxs.map((t) => ({ id: t.id, merchantName: t.merchantName, amount: t.amount })),
          catContext
        );
      } catch (catErr) {
        console.warn("[Transactions Route Categorizer Warning]", catErr);
      }
    }

    // Map to TransactionRow format expected by the frontend
    const formatted = scopedTxs.map((t) => {
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
