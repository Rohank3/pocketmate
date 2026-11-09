import { NextRequest, NextResponse } from "next/server";
import { paypalClient, PayPalTransaction } from "@/lib/paypal/client";
import { prisma } from "@/lib/db";
import { loadUserCategorizationContext, categorizeTransactionsBatch } from "@/lib/services/categorizer";
import { reconcileAutopaySubscriptions } from "@/lib/services/autopayReconciliation";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get("authorization") || "";
      const expectedHeader = `Bearer ${cronSecret}`;
      const isValid =
        authHeader.length === expectedHeader.length &&
        crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedHeader));

      if (!isValid) {
        return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
      }
    }

    // Sweep all registered users in the platform
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true },
    });

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        sweepTimestamp: new Date().toISOString(),
        usersSwept: 0,
        message: "No registered users to sweep.",
      });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const in48HoursStr = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);

    const userReports = [];

    for (const user of users) {
      // 1. Reconcile recurring autopay & detect new subscriptions
      const reconciliation = await reconcileAutopaySubscriptions(user.id, user.email);

      // 2. Fetch bills due in the next 48 hours
      const billsDueSoon = await prisma.scheduledEvent.findMany({
        where: {
          userId: user.id,
          status: "scheduled",
          type: "outgoing",
          date: {
            gte: todayStr,
            lte: in48HoursStr,
          },
        },
        orderBy: { date: "asc" },
      });

      // 3. Scan user's transactions for ambiguous/uncategorized items
      const userTransactions = await paypalClient.fetchRecentTransactions(24, user.email).catch(() => []);
      const catContext = await loadUserCategorizationContext(user.id);
      const categoryMap = await categorizeTransactionsBatch(
        userTransactions.map((t) => ({ id: t.id, merchantName: t.merchantName, amount: t.amount })),
        catContext
      );

      const ambiguousTransactions: Array<{
        transaction: PayPalTransaction;
        reason: string;
        suggestedCategories: string[];
      }> = [];

      for (const tx of userTransactions) {
        const res = categoryMap.get(tx.id);
        const isUncategorized = !res || res.category === "Uncategorized" || res.confidence < 0.8;
        if (isUncategorized) {
          ambiguousTransactions.push({
            transaction: tx,
            reason: "Ambiguous vendor name or low category match confidence.",
            suggestedCategories: (catContext.activeCategories ?? []).map((c) => c.name).slice(0, 3),
          });
        }
      }

      userReports.push({
        userId: user.id,
        email: user.email,
        name: user.name,
        reconciledSubscriptions: reconciliation.reconciledCount,
        newSubscriptionsFound: reconciliation.newSubscriptionsCount,
        billsDueIn48Hours: billsDueSoon.map((b) => ({
          title: b.title,
          amount: b.amount,
          date: b.date,
          category: b.category,
        })),
        ambiguousCount: ambiguousTransactions.length,
        status:
          billsDueSoon.length > 0 || ambiguousTransactions.length > 0
            ? "ATTENTION_REQUIRED"
            : "ALL_RECONCILED",
      });
    }

    return NextResponse.json({
      success: true,
      sweepTimestamp: new Date().toISOString(),
      usersSwept: users.length,
      userReports,
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    const message = error instanceof Error ? error.message : "EOD sweep execution error";
    console.error("[EOD Sweep Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
