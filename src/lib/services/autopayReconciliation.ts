import { prisma } from "@/lib/db";
import { paypalClient } from "@/lib/paypal/client";

interface SubscriptionMatcher {
  pattern: RegExp;
  name: string;
  category: string;
}

const KNOWN_SUBSCRIPTION_PROVIDERS: SubscriptionMatcher[] = [
  { pattern: /aws|amazon web services/i, name: "AWS Cloud Infrastructure", category: "Utilities" },
  { pattern: /cloudflare/i, name: "Cloudflare", category: "Utilities" },
  { pattern: /netflix/i, name: "Netflix", category: "Entertainment" },
  { pattern: /spotify/i, name: "Spotify", category: "Entertainment" },
  { pattern: /digital services|streaming/i, name: "Streaming & Digital Services", category: "Entertainment" },
  { pattern: /openai|chatgpt/i, name: "OpenAI ChatGPT Plus", category: "Services" },
  { pattern: /github/i, name: "GitHub Copilot", category: "Services" },
  { pattern: /google|workspace/i, name: "Google Workspace", category: "Services" },
  { pattern: /adobe/i, name: "Adobe Creative Cloud", category: "Software" },
  { pattern: /apple/i, name: "Apple Services", category: "Entertainment" },
  { pattern: /hulu|disney/i, name: "Disney / Hulu", category: "Entertainment" },
];

export interface ReconciliationReport {
  reconciledCount: number;
  newSubscriptionsCount: number;
  reconciledEventTitles: string[];
}

/**
 * Reconciles scheduled bills with settled PayPal transactions and auto-detects
 * recurring subscriptions from PayPal transaction activity.
 */
export async function reconcileAutopaySubscriptions(
  userId: string,
  userEmail?: string
): Promise<ReconciliationReport> {
  const report: ReconciliationReport = {
    reconciledCount: 0,
    newSubscriptionsCount: 0,
    reconciledEventTitles: [],
  };

  if (!userId) return report;

  try {
    // 1. Fetch recent transactions for this user account (up to 30 days)
    const transactions = await paypalClient.fetchRecentTransactions(720, userEmail);
    if (!transactions || transactions.length === 0) return report;

    // 2. Fetch all scheduled events for this user
    let existingEvents = await prisma.scheduledEvent.findMany({
      where: { userId },
    });

    const completedTxs = transactions.filter(
      (tx) => tx.status === "COMPLETED" && tx.amount > 0
    );

    // 3. Auto-Reconcile: Match open scheduled bills with completed PayPal transactions
    for (const evt of existingEvents) {
      if (evt.status === "completed" || evt.type !== "outgoing") continue;

      const matchingTx = completedTxs.find((tx) => {
        // Amount match tolerance within 5 cents
        const amountMatches = Math.abs(tx.amount - evt.amount) < 0.05;

        const mName = tx.merchantName.toLowerCase();
        const cp = (evt.counterparty || "").toLowerCase();
        const title = evt.title.toLowerCase();

        // Merchant or title keyword match
        const merchantMatches =
          (cp && (mName.includes(cp) || cp.includes(mName))) ||
          title.includes(mName) ||
          mName.includes("aws") && (title.includes("aws") || cp.includes("aws")) ||
          mName.includes("streaming") && (title.includes("streaming") || cp.includes("digital services")) ||
          mName.includes("cloudflare") && title.includes("cloudflare");

        return amountMatches && merchantMatches;
      });

      if (matchingTx) {
        await prisma.scheduledEvent.update({
          where: { id: evt.id },
          data: {
            status: "completed",
            counterparty: evt.counterparty || matchingTx.merchantName,
          },
        });
        report.reconciledCount++;
        report.reconciledEventTitles.push(evt.title);
      }
    }

    // Refresh existing events list after updates
    existingEvents = await prisma.scheduledEvent.findMany({
      where: { userId },
    });

    // 4. Auto-Detect: Identify recurring subscriptions from transaction history
    for (const tx of completedTxs) {
      const mName = tx.merchantName;
      const matchedProvider = KNOWN_SUBSCRIPTION_PROVIDERS.find((p) =>
        p.pattern.test(mName)
      );

      if (matchedProvider) {
        // Check if an event already exists for this provider
        const alreadyScheduled = existingEvents.some((e) => {
          const cp = (e.counterparty || "").toLowerCase();
          const title = e.title.toLowerCase();
          const target = matchedProvider.name.toLowerCase();
          return cp.includes(target) || title.includes(target) || matchedProvider.pattern.test(title);
        });

        if (!alreadyScheduled) {
          const txDate = new Date(tx.timestamp);
          const dayOfMonth = txDate.getDate() || 15;
          const yr = txDate.getFullYear() || new Date().getFullYear();
          const mo = String(txDate.getMonth() + 1).padStart(2, "0");
          const dateStr = `${yr}-${mo}-${String(dayOfMonth).padStart(2, "0")}`;

          await prisma.scheduledEvent.create({
            data: {
              userId,
              title: `${matchedProvider.name}`,
              amount: tx.amount,
              date: dateStr,
              dayOfMonth,
              type: "outgoing",
              category: matchedProvider.category,
              counterparty: matchedProvider.name,
              status: "completed", // Settled for this billing cycle
            },
          });

          report.newSubscriptionsCount++;
          report.reconciledEventTitles.push(matchedProvider.name);

          // Update in-memory tracker to prevent duplicate creations in same loop
          existingEvents.push({
            id: `temp_${Date.now()}`,
            userId,
            title: matchedProvider.name,
            amount: tx.amount,
            date: dateStr,
            dayOfMonth,
            type: "outgoing",
            category: matchedProvider.category,
            counterparty: matchedProvider.name,
            status: "completed",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    }
  } catch (err) {
    console.warn("[Autopay Reconciliation Warning]", err);
  }

  return report;
}
