import { prisma } from "@/lib/db";
import { paypalClient } from "@/lib/paypal/client";
import { formatCounterpartyWithLifecycle } from "@/lib/utils/subscriptionLifecycle";
import { normalizeMerchant } from "./categorizer";

export interface ReconciliationReport {
  reconciledCount: number;
  newSubscriptionsCount: number;
  reconciledEventTitles: string[];
}

interface DynamicSubscription {
  merchantName: string;
  canonicalName: string;
  category: string;
  amount: number;
  dayOfMonth: number;
  timestamp: string;
  confidence: number;
  source: "cadence_analysis" | "gemini_inference" | "heuristic_indicator";
}

// Session-level classification cache to minimize repeated AI inferences
const subscriptionClassificationCache = new Map<
  string,
  { isRecurring: boolean; canonicalName: string; category: string }
>();

/**
 * Dynamically queries Gemini AI to determine whether transactions represent
 * ongoing subscriptions, SaaS tools, utilities, or recurring memberships.
 * Zero hardcoded merchant names or static provider tables.
 */
async function classifySubscriptionsWithGemini(
  candidates: Array<{ merchantName: string; amount: number; memo?: string }>
): Promise<Map<string, { isRecurring: boolean; canonicalName: string; category: string }>> {
  const results = new Map<string, { isRecurring: boolean; canonicalName: string; category: string }>();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECONDARY;

  if (!apiKey || apiKey === "your-gemini-api-key" || candidates.length === 0) {
    return results;
  }

  const prompt = `
You are PocketMate's Autonomous Financial Subscription Intelligence.
Analyze the following financial transactions from a user's ledger:

${JSON.stringify(
  candidates.map((c) => ({
    merchant: c.merchantName,
    amount: c.amount,
    memo: c.memo || "",
  })),
  null,
  2
)}

TASK:
Identify which of these transactions represent ongoing recurring subscriptions, utilities, rent, memberships, or digital services (e.g., streaming, gym memberships, software licenses, broadband/mobile, cloud storage, power utilities).
DO NOT use hardcoded vendor lists. Evaluate based on merchant name semantics, typical SaaS/subscription pricing patterns, and memo context.

OUTPUT SCHEMA:
Return ONLY valid JSON matching this schema:
{
  "classifications": [
    {
      "merchant": "Exact merchant string from input",
      "canonicalName": "Clean Title (e.g. Netflix, Equinox Fitness, Google Workspace)",
      "isRecurring": true,
      "category": "Entertainment" | "Utilities" | "Services" | "Software" | "Rent" | "Personal",
      "confidence": 0.95
    }
  ]
}
`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        const list = parsed.classifications || parsed.subscriptions || [];
        for (const item of list) {
          if (item.merchant && typeof item.isRecurring === "boolean") {
            results.set(normalizeMerchant(item.merchant), {
              isRecurring: item.isRecurring,
              canonicalName: item.canonicalName || item.merchant,
              category: item.category || "Services",
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Autopay Reconciliation] Gemini inference warning:", err);
  }

  return results;
}

/**
 * Heuristic semantic indicators for recurring patterns (used when Gemini AI is offline).
 */
const RECURRING_SEMANTIC_INDICATORS = /\b(subscription|sub|autopay|recurring|monthly|membership|bill|utility|power|electric|water|gas|internet|broadband|hosting|cloud|saas|storage|insurance|premium|stream|gym|fitness|rent|lease|realty)\b/i;

/**
 * Reconciles scheduled bills with settled PayPal transactions and dynamically auto-detects
 * recurring subscriptions from PayPal transaction activity without hardcoded provider lists.
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
      const evtDate = new Date(evt.date);
      const isFuture = evtDate.getTime() > Date.now();

      // If an event is scheduled for a future date, it cannot be completed yet
      if (isFuture) {
        if (evt.status === "completed") {
          await prisma.scheduledEvent.update({
            where: { id: evt.id },
            data: { status: "scheduled" },
          });
          evt.status = "scheduled";
        }
        continue;
      }

      if (evt.status === "completed" || evt.type !== "outgoing") continue;

      // Only match with completed transactions from the SAME month & year as the event
      const matchingTx = completedTxs.find((tx) => {
        const txDate = new Date(tx.timestamp);
        const sameMonthYear =
          txDate.getFullYear() === evtDate.getFullYear() &&
          txDate.getMonth() === evtDate.getMonth();
        if (!sameMonthYear) return false;

        // Amount match tolerance within 5 cents
        const amountMatches = Math.abs(tx.amount - evt.amount) < 0.05;

        const mName = tx.merchantName.toLowerCase();
        const cp = (evt.counterparty || "").toLowerCase();
        const title = evt.title.toLowerCase();

        // Merchant or title keyword match
        const merchantMatches =
          (cp && (mName.includes(cp) || cp.includes(mName))) ||
          title.includes(mName) ||
          mName.includes(title);

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

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const todayDay = now.getDate();

    // 4. Dynamic Subscription Detection Engine (Zero Hardcoded Providers)
    // Step 4A: Algorithmic Cadence Analysis
    // Group completed transactions by normalized merchant to detect repeating billing cadences
    const txsByMerchant = new Map<string, typeof completedTxs>();
    for (const tx of completedTxs) {
      const norm = normalizeMerchant(tx.merchantName);
      const list = txsByMerchant.get(norm) || [];
      list.push(tx);
      txsByMerchant.set(norm, list);
    }

    const dynamicallyDetected: DynamicSubscription[] = [];
    const classifiedNorms = new Set<string>();

    for (const [normMerchant, txList] of txsByMerchant.entries()) {
      if (txList.length >= 2) {
        // Chronological sort
        const sorted = [...txList].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        for (let i = 0; i < sorted.length - 1; i++) {
          const t1 = sorted[i];
          const t2 = sorted[i + 1];
          const daysDiff = Math.abs(
            (new Date(t2.timestamp).getTime() - new Date(t1.timestamp).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          const amountMatches = Math.abs(t1.amount - t2.amount) <= 0.05;

          // Natural monthly cadence occurs within 25 to 35 calendar days
          if (amountMatches && daysDiff >= 25 && daysDiff <= 35) {
            const txDate = new Date(t2.timestamp);
            dynamicallyDetected.push({
              merchantName: t2.merchantName,
              canonicalName: t2.merchantName,
              category: "Services",
              amount: t2.amount,
              dayOfMonth: txDate.getDate() || 15,
              timestamp: t2.timestamp,
              confidence: 0.98,
              source: "cadence_analysis",
            });
            classifiedNorms.add(normMerchant);
            subscriptionClassificationCache.set(normMerchant, {
              isRecurring: true,
              canonicalName: t2.merchantName,
              category: "Services",
            });
            break;
          }
        }
      }
    }

    // Step 4B: AI Zero-Shot Recurring Inference for Unclassified Transactions
    const unclassifiedCandidates: Array<{ merchantName: string; amount: number; memo?: string }> = [];
    for (const tx of completedTxs) {
      const norm = normalizeMerchant(tx.merchantName);
      if (classifiedNorms.has(norm)) continue;

      if (subscriptionClassificationCache.has(norm)) {
        const cached = subscriptionClassificationCache.get(norm)!;
        if (cached.isRecurring) {
          const txDate = new Date(tx.timestamp);
          dynamicallyDetected.push({
            merchantName: tx.merchantName,
            canonicalName: cached.canonicalName,
            category: cached.category,
            amount: tx.amount,
            dayOfMonth: txDate.getDate() || 15,
            timestamp: tx.timestamp,
            confidence: 0.92,
            source: "gemini_inference",
          });
          classifiedNorms.add(norm);
        }
        continue;
      }

      unclassifiedCandidates.push({
        merchantName: tx.merchantName,
        amount: tx.amount,
        memo: tx.memo,
      });
    }

    if (unclassifiedCandidates.length > 0) {
      const aiResults = await classifySubscriptionsWithGemini(unclassifiedCandidates);
      for (const [norm, classification] of aiResults.entries()) {
        subscriptionClassificationCache.set(norm, classification);

        if (classification.isRecurring) {
          const matchedTx = completedTxs.find((t) => normalizeMerchant(t.merchantName) === norm);
          if (matchedTx) {
            const txDate = new Date(matchedTx.timestamp);
            dynamicallyDetected.push({
              merchantName: matchedTx.merchantName,
              canonicalName: classification.canonicalName,
              category: classification.category,
              amount: matchedTx.amount,
              dayOfMonth: txDate.getDate() || 15,
              timestamp: matchedTx.timestamp,
              confidence: 0.92,
              source: "gemini_inference",
            });
            classifiedNorms.add(norm);
          }
        }
      }
    }

    // Step 4C: Semantic Linguistic Heuristic Fallback
    for (const tx of completedTxs) {
      const norm = normalizeMerchant(tx.merchantName);
      if (classifiedNorms.has(norm)) continue;

      const isSemanticMatch =
        RECURRING_SEMANTIC_INDICATORS.test(tx.merchantName) ||
        (tx.memo && RECURRING_SEMANTIC_INDICATORS.test(tx.memo));

      if (isSemanticMatch) {
        const txDate = new Date(tx.timestamp);
        dynamicallyDetected.push({
          merchantName: tx.merchantName,
          canonicalName: tx.merchantName,
          category: "Services",
          amount: tx.amount,
          dayOfMonth: txDate.getDate() || 15,
          timestamp: tx.timestamp,
          confidence: 0.85,
          source: "heuristic_indicator",
        });
        classifiedNorms.add(norm);
      }
    }

    // Step 4D: Persist Detected Subscriptions to User's Calendar
    for (const sub of dynamicallyDetected) {
      const normSubName = normalizeMerchant(sub.canonicalName);
      const existingForSub = existingEvents.find((e) => {
        const cp = normalizeMerchant(e.counterparty || "");
        const title = normalizeMerchant(e.title);
        return cp.includes(normSubName) || title.includes(normSubName) || normSubName.includes(title);
      });

      const dayOfMonth = sub.dayOfMonth;
      const eventDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(
        dayOfMonth
      ).padStart(2, "0")}`;
      const isFutureInCurrentMonth = dayOfMonth > todayDay;

      if (!existingForSub) {
        const startDateStr = new Date(sub.timestamp).toISOString().slice(0, 10);
        const formattedCp = formatCounterpartyWithLifecycle(sub.canonicalName, startDateStr);
        const initialStatus = isFutureInCurrentMonth ? "scheduled" : "completed";

        await prisma.scheduledEvent.create({
          data: {
            userId,
            title: sub.canonicalName,
            amount: sub.amount,
            date: eventDateStr,
            dayOfMonth,
            type: "outgoing",
            category: sub.category,
            counterparty: formattedCp,
            status: initialStatus,
          },
        });

        report.newSubscriptionsCount++;
        report.reconciledEventTitles.push(sub.canonicalName);

        existingEvents.push({
          id: `temp_${Date.now()}_${Math.random()}`,
          userId,
          title: sub.canonicalName,
          amount: sub.amount,
          date: eventDateStr,
          dayOfMonth,
          type: "outgoing",
          category: sub.category,
          counterparty: formattedCp,
          status: initialStatus,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        const evtDate = new Date(existingForSub.date);
        const isPastMonth =
          evtDate.getFullYear() < currentYear ||
          (evtDate.getFullYear() === currentYear && evtDate.getMonth() < currentMonth);

        if (isPastMonth || isFutureInCurrentMonth) {
          const hasTxInCurrentMonth = completedTxs.some((t) => {
            const d = new Date(t.timestamp);
            return (
              d.getFullYear() === currentYear &&
              d.getMonth() === currentMonth &&
              Math.abs(t.amount - existingForSub.amount) < 0.05 &&
              normalizeMerchant(t.merchantName) === normSubName
            );
          });

          const updatedStatus = isFutureInCurrentMonth && !hasTxInCurrentMonth ? "scheduled" : "completed";
          await prisma.scheduledEvent.update({
            where: { id: existingForSub.id },
            data: {
              date: eventDateStr,
              dayOfMonth,
              status: updatedStatus,
            },
          });
          existingForSub.date = eventDateStr;
          existingForSub.status = updatedStatus;
        }
      }
    }
  } catch (err) {
    console.warn("[Autopay Reconciliation Warning]", err);
  }

  return report;
}
