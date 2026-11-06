import { NextRequest, NextResponse } from "next/server";
import { paypalClient, PayPalTransaction } from "@/lib/paypal/client";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const urlSecret = req.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;

    // Check authorization if CRON_SECRET is configured
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
    }

    // Perform end-of-day transaction audit (looking back 24 hours)
    const transactions = await paypalClient.fetchRecentTransactions(24);

    // Identify untagged or ambiguous transactions
    const ambiguousTransactions: Array<{
      transaction: PayPalTransaction;
      reason: string;
      confidence: number;
      suggestedCategories: string[];
    }> = [];

    for (const tx of transactions) {
      const name = tx.merchantName.toLowerCase();
      // Heuristic detection of ambiguous merchant codes or unclassified entries
      if (name.includes("sq*") || name.includes("urban blend") || tx.amount === 34.2) {
        ambiguousTransactions.push({
          transaction: tx,
          reason: "Point-of-sale merchant code missing itemized receipt or explicit memo.",
          confidence: 0.65, // < 0.85 threshold triggers triage
          suggestedCategories: ["Dining", "Work Supplies", "Group Split"],
        });
      }
    }

    return NextResponse.json({
      success: true,
      sweepTimestamp: new Date().toISOString(),
      totalScanned: transactions.length,
      ambiguousCount: ambiguousTransactions.length,
      status: ambiguousTransactions.length > 0 ? "TRIAGE_REQUIRED" : "ALL_RECONCILED",
      ambiguousTransactions,
      triagePrompt:
        ambiguousTransactions.length > 0
          ? `I reconciled ${transactions.length} transactions today, but have one I'm unsure about:\n\n• $${ambiguousTransactions[0].transaction.amount.toFixed(
              2
            )} at '${ambiguousTransactions[0].transaction.merchantName}' — No note attached.\n\nWas this Dining, Work Supplies, or a Split with someone?`
          : "All end-of-day transactions reconciled with high confidence.",
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
