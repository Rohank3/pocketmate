import { prisma } from "@/lib/db";

export interface TransactionForCategorization {
  id: string;
  merchantName: string;
  amount: number;
  note?: string;
}

export interface CategorizedTransactionResult {
  id: string;
  category: string;
  confidence: number;
  source: "override" | "merchant_rule" | "subscription_match" | "gemini_ai" | "fallback_heuristic" | "uncategorized";
  matchedRuleId?: string;
  reasoning?: string;
}

export interface CategorizationContext {
  userId: string;
  activeCategories?: Array<{ id: string; name: string }>;
  merchantRules?: Array<{ id: string; merchantPattern: string; categoryName: string }>;
  overrides?: Array<{ id: string; transactionId: string; categoryName: string }>;
}

const KNOWN_SUBSCRIPTION_KEYWORDS: Array<{ pattern: RegExp; canonicalCategory: string }> = [
  { pattern: /aws|amazon web services/i, canonicalCategory: "Utilities" },
  { pattern: /cloudflare/i, canonicalCategory: "Utilities" },
  { pattern: /netflix/i, canonicalCategory: "Entertainment" },
  { pattern: /spotify/i, canonicalCategory: "Entertainment" },
  { pattern: /digital services|streaming/i, canonicalCategory: "Entertainment" },
  { pattern: /openai|chatgpt/i, canonicalCategory: "Services" },
  { pattern: /github/i, canonicalCategory: "Services" },
  { pattern: /google|workspace/i, canonicalCategory: "Services" },
  { pattern: /adobe/i, canonicalCategory: "Software" },
  { pattern: /apple/i, canonicalCategory: "Entertainment" },
  { pattern: /hulu|disney/i, canonicalCategory: "Entertainment" },
];

export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/^sq\*\s*/i, "")
    .replace(/^paypal\s*\*\s*/i, "")
    .replace(/^sp\s*\*\s*/i, "")
    .replace(/^tst\*\s*/i, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loads categorization context (categories, overrides, merchant rules) from database.
 */
export async function loadUserCategorizationContext(userId: string): Promise<CategorizationContext> {
  const [activeCategories, merchantRules, overrides] = await Promise.all([
    prisma.budgetCategory.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.merchantCategoryRule.findMany({
      where: { userId },
      select: { id: true, merchantPattern: true, categoryName: true },
    }),
    prisma.transactionCategoryOverride.findMany({
      where: { userId },
      select: { id: true, transactionId: true, categoryName: true },
    }),
  ]);

  return {
    userId,
    activeCategories,
    merchantRules,
    overrides,
  };
}

/**
 * Categorizes a batch of transactions using the hybrid pipeline:
 * 1. Transaction Overrides
 * 2. Learned Merchant Rules
 * 3. Subscription Matcher
 * 4. Gemini Zero-Shot AI
 * 5. Fallback Heuristics / "Uncategorized"
 */
export async function categorizeTransactionsBatch(
  transactions: TransactionForCategorization[],
  context: CategorizationContext
): Promise<Map<string, CategorizedTransactionResult>> {
  const results = new Map<string, CategorizedTransactionResult>();
  if (transactions.length === 0) return results;

  const userCategories = context.activeCategories ?? [];
  const categoryNames = userCategories.map((c) => c.name);
  const categoryNameSet = new Set(categoryNames.map((n) => n.toLowerCase()));

  const overrideMap = new Map<string, string>();
  for (const o of context.overrides ?? []) {
    overrideMap.set(o.transactionId, o.categoryName);
  }

  const ruleMap = new Map<string, { id: string; categoryName: string }>();
  for (const r of context.merchantRules ?? []) {
    ruleMap.set(r.merchantPattern.toLowerCase(), { id: r.id, categoryName: r.categoryName });
  }

  const unclassifiedForAI: TransactionForCategorization[] = [];

  for (const tx of transactions) {
    // 1. Transaction-level override check
    if (overrideMap.has(tx.id)) {
      const cat = overrideMap.get(tx.id)!;
      results.set(tx.id, {
        id: tx.id,
        category: cat,
        confidence: 1.0,
        source: "override",
      });
      continue;
    }

    const normMerchant = normalizeMerchant(tx.merchantName);

    // 2. Learned merchant rule check (exact or normalized substring match)
    let matchedRule: { id: string; categoryName: string } | undefined = ruleMap.get(normMerchant);
    if (!matchedRule) {
      for (const [pattern, rule] of ruleMap.entries()) {
        if (normMerchant.includes(pattern) || pattern.includes(normMerchant)) {
          matchedRule = rule;
          break;
        }
      }
    }

    if (matchedRule) {
      // Validate that category is still valid or user accepts it
      const isValid =
        categoryNameSet.has(matchedRule.categoryName.toLowerCase()) ||
        matchedRule.categoryName.toLowerCase() === "uncategorized";

      if (isValid) {
        results.set(tx.id, {
          id: tx.id,
          category: matchedRule.categoryName,
          confidence: 0.99,
          source: "merchant_rule",
          matchedRuleId: matchedRule.id,
        });
        continue;
      }
    }

    // 3. Known subscription provider matching
    let subscriptionCategory: string | null = null;
    for (const sub of KNOWN_SUBSCRIPTION_KEYWORDS) {
      if (sub.pattern.test(tx.merchantName)) {
        // Find if user has a corresponding category
        const directMatch = categoryNames.find(
          (c) =>
            c.toLowerCase() === sub.canonicalCategory.toLowerCase() ||
            c.toLowerCase().includes("subscri") ||
            c.toLowerCase().includes("util")
        );
        if (directMatch) {
          subscriptionCategory = directMatch;
          break;
        }
      }
    }

    if (subscriptionCategory) {
      results.set(tx.id, {
        id: tx.id,
        category: subscriptionCategory,
        confidence: 0.95,
        source: "subscription_match",
      });
      continue;
    }

    // Queue for Gemini AI zero-shot classification
    unclassifiedForAI.push(tx);
  }

  // 4. Gemini Zero-Shot AI Classification
  if (unclassifiedForAI.length > 0 && categoryNames.length > 0) {
    try {
      const aiResults = await classifyWithGeminiZeroShot(
        unclassifiedForAI,
        categoryNames,
        context.userId
      );

      for (const [txId, res] of aiResults.entries()) {
        results.set(txId, res);
      }
    } catch (err) {
      console.warn("[Categorizer] Gemini AI batch classification failed, invoking resilient fallback:", err);
    }
  }

  // 5. Fallback for any transactions still unclassified
  for (const tx of transactions) {
    if (!results.has(tx.id)) {
      const fallbackCat = heuristicCategoryMatch(tx, categoryNames);
      results.set(tx.id, {
        id: tx.id,
        category: fallbackCat || "Uncategorized",
        confidence: fallbackCat ? 0.75 : 0.0,
        source: fallbackCat ? "fallback_heuristic" : "uncategorized",
      });
    }
  }

  return results;
}

/**
 * Invokes Gemini 2.5 Flash to perform zero-shot category classification.
 */
async function classifyWithGeminiZeroShot(
  transactions: TransactionForCategorization[],
  availableCategories: string[],
  userId: string
): Promise<Map<string, CategorizedTransactionResult>> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECONDARY;
  const results = new Map<string, CategorizedTransactionResult>();

  if (!apiKey || apiKey === "your-gemini-api-key") {
    return results;
  }

  const categoryListStr = availableCategories.map((c) => `"${c}"`).join(", ");

  const prompt = `
You are PocketMate's Transaction Categorization Intelligence.
Categorize each financial transaction into ONE of the Available Categories below.

AVAILABLE CATEGORIES:
[${categoryListStr}]

RULES:
1. Note Precedence: If the user provided a "note", prioritize the note over the merchant name (e.g. Merchant "Target" with note "team lunch" belongs in a food/dining category).
2. Entity Understanding: Use real-world vendor understanding (e.g., Chipotle/Starbucks -> Dining, Shell/Chevron -> Travel/Gas, Zara/H&M -> Shopping).
3. Missing Fit: If NO category in the Available Categories list is a genuine fit, or confidence is under 0.80, categorize as "Uncategorized".
4. Output Schema: Return ONLY valid JSON array with objects formatted as:
[
  {
    "id": "tx_id",
    "category": "exact category name from list or 'Uncategorized'",
    "confidence": 0.0 to 1.0,
    "reasoning": "brief explanation",
    "isAutoLearnable": boolean (true if merchant has a definitive single-purpose identity, without specific one-off notes)
  }
]

TRANSACTIONS TO CLASSIFY:
${JSON.stringify(
  transactions.map((t) => ({
    id: t.id,
    merchant: t.merchantName,
    amount: t.amount,
    note: t.note || null,
  })),
  null,
  2
)}
`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Gemini Categorizer API Error: ${res.status}]`, await res.text());
      return results;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return results;

    interface GeminiOutputItem {
      id: string;
      category: string;
      confidence: number;
      reasoning?: string;
      isAutoLearnable?: boolean;
    }

    const parsed: GeminiOutputItem[] = JSON.parse(rawText);
    const validCategoryLowerMap = new Map(availableCategories.map((c) => [c.toLowerCase(), c]));

    const learnableRulesToPersist: Array<{ merchantPattern: string; categoryName: string }> = [];

    for (const item of parsed) {
      if (!item.id) continue;
      const originalTx = transactions.find((t) => t.id === item.id);
      if (!originalTx) continue;

      const matchedName = validCategoryLowerMap.get((item.category || "").toLowerCase());
      const isHighConfidence = item.confidence >= 0.80 && Boolean(matchedName);

      const finalCategory = isHighConfidence && matchedName ? matchedName : "Uncategorized";

      results.set(item.id, {
        id: item.id,
        category: finalCategory,
        confidence: item.confidence ?? (isHighConfidence ? 0.85 : 0.0),
        source: "gemini_ai",
        reasoning: item.reasoning,
      });

      // If high confidence, auto-learnable, and merchant has no transaction-specific note, queue rule persistence
      if (
        isHighConfidence &&
        item.isAutoLearnable &&
        item.confidence >= 0.90 &&
        !originalTx.note &&
        matchedName
      ) {
        const norm = normalizeMerchant(originalTx.merchantName);
        if (norm.length >= 3) {
          learnableRulesToPersist.push({
            merchantPattern: norm,
            categoryName: matchedName,
          });
        }
      }
    }

    // Persist learned rules in the background asynchronously
    if (learnableRulesToPersist.length > 0) {
      persistLearnedRules(userId, learnableRulesToPersist).catch((err) => {
        console.warn("[Categorizer] Failed to persist learned merchant rules:", err);
      });
    }

    return results;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn("[Categorizer] Gemini network call error or timeout:", error);
    return results;
  }
}

/**
 * Heuristic fallback matching for common merchant keywords against user's categories.
 */
function heuristicCategoryMatch(
  tx: TransactionForCategorization,
  availableCategories: string[]
): string | null {
  const m = tx.merchantName.toLowerCase();
  const lowerCats = availableCategories.map((c) => ({ name: c, lower: c.toLowerCase() }));

  const findCat = (keywords: string[]): string | null => {
    const matched = lowerCats.find((c) => keywords.some((kw) => c.lower.includes(kw)));
    return matched ? matched.name : null;
  };

  if (m.includes("bar") || m.includes("diner") || m.includes("coffee") || m.includes("bistro") || m.includes("restaurant") || m.includes("cafe")) {
    return findCat(["dining", "food", "restaurant", "meal"]);
  }
  if (m.includes("target") || m.includes("grocer") || m.includes("market") || m.includes("whole foods") || m.includes("trader joe")) {
    return findCat(["grocer", "food", "market", "shopping"]);
  }
  if (m.includes("lane") || m.includes("bowling") || m.includes("movie") || m.includes("cinema") || m.includes("amc")) {
    return findCat(["entertain", "fun", "leisure", "social"]);
  }
  if (m.includes("zara") || m.includes("h&m") || m.includes("clothing") || m.includes("mall")) {
    return findCat(["shop", "retail", "clothing"]);
  }
  if (m.includes("transit") || m.includes("metro") || m.includes("uber") || m.includes("lyft") || m.includes("flight") || m.includes("airline")) {
    return findCat(["travel", "transport", "transit", "commute"]);
  }

  return null;
}

/**
 * Persists learned merchant rules to database.
 */
async function persistLearnedRules(
  userId: string,
  rules: Array<{ merchantPattern: string; categoryName: string }>
): Promise<void> {
  for (const rule of rules) {
    try {
      await prisma.merchantCategoryRule.upsert({
        where: {
          userId_merchantPattern: {
            userId,
            merchantPattern: rule.merchantPattern,
          },
        },
        update: {
          categoryName: rule.categoryName,
          isAutoLearned: true,
        },
        create: {
          userId,
          merchantPattern: rule.merchantPattern,
          categoryName: rule.categoryName,
          isAutoLearned: true,
        },
      });
    } catch {
      // Ignore conflict or transient DB race condition
    }
  }
}
