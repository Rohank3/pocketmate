import { NextRequest, NextResponse } from "next/server";
import { paypalClient, PayPalTransaction } from "@/lib/paypal/client";
import { prisma } from "@/lib/db";
import { loadUserCategorizationContext, categorizeTransactionsBatch } from "@/lib/services/categorizer";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "Cron sweep trigger is not configured or disabled." },
        { status: 503 }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const expectedHeader = `Bearer ${cronSecret}`;
    const isValid =
      authHeader.length === expectedHeader.length &&
      crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedHeader));

    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
    }

    // Perform end-of-day transaction audit (looking back 24 hours)
    const transactions = await paypalClient.fetchRecentTransactions(24);

    // Identify untagged or ambiguous transactions
    const firstUser = await prisma.user.findFirst({ select: { id: true } });
    const userId = firstUser?.id || "demo_user";

    const catContext = await loadUserCategorizationContext(userId);
    const categoryMap = await categorizeTransactionsBatch(
      transactions.map((t) => ({ id: t.id, merchantName: t.merchantName, amount: t.amount })),
      catContext
    );

    const availableCatNames = (catContext.activeCategories ?? []).map((c) => c.name);

    const ambiguousTransactions: Array<{
      transaction: PayPalTransaction;
      reason: string;
      confidence: number;
      suggestedCategories: string[];
    }> = [];

    for (const tx of transactions) {
      const res = categoryMap.get(tx.id);
      const isUncategorized = !res || res.category === "Uncategorized" || res.confidence < 0.8;

      if (isUncategorized) {
        ambiguousTransactions.push({
          transaction: tx,
          reason: "No matching category in active budgets, or ambiguous vendor name.",
          confidence: res?.confidence || 0.5,
          suggestedCategories: availableCatNames.length > 0 ? availableCatNames.slice(0, 3) : ["Dining", "Shopping", "General"],
        });
      }
    }

    const firstAmbiguous = ambiguousTransactions[0];
    const catOptionsStr = firstAmbiguous?.suggestedCategories.join(", ") || "Dining, Shopping, or General";

    return NextResponse.json({
      success: true,
      sweepTimestamp: new Date().toISOString(),
      totalScanned: transactions.length,
      ambiguousCount: ambiguousTransactions.length,
      status: ambiguousTransactions.length > 0 ? "TRIAGE_REQUIRED" : "ALL_RECONCILED",
      ambiguousTransactions,
      triagePrompt:
        ambiguousTransactions.length > 0
          ? `I reconciled ${transactions.length} transactions today, but found ${
              ambiguousTransactions.length
            } requiring category tagging:\n\n• $${firstAmbiguous.transaction.amount.toFixed(
              2
            )} at '${firstAmbiguous.transaction.merchantName}' — No category matched.\n\nShould this be logged under ${catOptionsStr}, or should I create a new category for it? (Reply and I'll remember it for next time!)`
          : "All end-of-day transactions reconciled with high confidence across your active budgets.",
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
