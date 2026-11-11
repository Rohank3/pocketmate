import { prisma } from "@/lib/db";
import { callGeminiApi } from "@/lib/agent/geminiClient";

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
  source: "override" | "merchant_rule" | "gemini_ai" | "uncategorized";
  matchedRuleId?: string;
  suggestedCategory?: string;
  reasoning?: string;
}

export interface CategorizationContext {
  userId: string;
  industry?: string | null;
  persona?: string;
  activeCategories?: Array<{ id: string; name: string }>;
  merchantRules?: Array<{ id: string; merchantPattern: string; categoryName: string }>;
  overrides?: Array<{ id: string; transactionId: string; categoryName: string }>;
}

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
  const [user, activeCategories, merchantRules, overrides] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { industry: true, persona: true },
    }).catch(() => null),
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
    industry: user?.industry || null,
    persona: user?.persona || "GENERAL",
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

    // Queue for Gemini AI zero-shot classification
    unclassifiedForAI.push(tx);
  }

  // 3. Gemini Zero-Shot AI Classification
  if (unclassifiedForAI.length > 0 && categoryNames.length > 0) {
    try {
      const aiResults = await classifyWithGeminiZeroShot(
        unclassifiedForAI,
        categoryNames,
        context.userId,
        context.industry
      );

      for (const [txId, res] of aiResults.entries()) {
        results.set(txId, res);
      }
    } catch (err) {
      console.warn("[Categorizer] Gemini AI batch classification failed:", err);
    }
  }

  // 4. Default unclassified transactions to Uncategorized with 0 confidence (no hardcoded guesses)
  for (const tx of transactions) {
    if (!results.has(tx.id)) {
      results.set(tx.id, {
        id: tx.id,
        category: "Uncategorized",
        confidence: 0.0,
        source: "uncategorized",
        suggestedCategory: "Uncategorized",
        reasoning: "Awaiting user category assignment.",
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
  userId: string,
  industry?: string | null
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
${industry ? `REGISTERED BUSINESS INDUSTRY: ${industry}. Contextualize expenditures through the accounting and operational lens of this specific industry.\n` : ""}
AVAILABLE CATEGORIES:
[${categoryListStr}]

RULES:
1. Note Precedence: If the user provided a "note", prioritize the note over the merchant name.
2. Entity Understanding: Use real-world vendor understanding to classify transactions accurately into the available categories.
3. Missing Fit: If NO category in the Available Categories list is a genuine fit, categorize as "Uncategorized".
4. Output Schema: Return ONLY valid JSON array with objects formatted as:
[
  {
    "id": "tx_id",
    "category": "exact category name from list or 'Uncategorized'",
    "confidence": 0.0 to 1.0,
    "reasoning": "brief explanation",
    "isAutoLearnable": boolean (true if merchant has a definitive single-purpose identity)
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

  try {
    const res = await callGeminiApi({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
      timeoutMs: 8000,
    });

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
        suggestedCategory: matchedName || item.category || "Uncategorized",
        confidence: item.confidence ?? (isHighConfidence ? 0.9 : 0.0),
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
    console.warn("[Categorizer] Gemini network call error or timeout:", error);
    return results;
  }
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

export type ReclassifyScope = "single" | "merchant" | "similar";

export interface ReclassifyTransactionParams {
  userId: string;
  transactionId: string;
  merchantName: string;
  targetCategory: string;
  scope: ReclassifyScope;
  allTransactions?: Array<{ id: string; merchantName: string; memo?: string; amount: number }>;
}

export interface ReclassificationResult {
  scope: ReclassifyScope;
  updatedTransactionIds: string[];
  ruleCreated?: { pattern: string; category: string };
  similarCount?: number;
  warning?: string;
  message: string;
}

/**
 * Executes a scoped reclassification according to user selection:
 * 1. 'single': Only this specific transaction
 * 2. 'merchant': All transactions for this particular merchant
 * 3. 'similar': All semantically similar vendor transactions via Gemini AI
 */
export async function reclassifyTransactionWithScope(
  params: ReclassifyTransactionParams
): Promise<ReclassificationResult> {
  const { userId, transactionId, merchantName, targetCategory, scope, allTransactions = [] } = params;
  const normMerchant = normalizeMerchant(merchantName);

  if (scope === "single") {
    await prisma.transactionCategoryOverride.upsert({
      where: {
        userId_transactionId: {
          userId,
          transactionId,
        },
      },
      update: { categoryName: targetCategory },
      create: {
        userId,
        transactionId,
        categoryName: targetCategory,
      },
    });

    return {
      scope: "single",
      updatedTransactionIds: [transactionId],
      message: `Categorized transaction as '${targetCategory}'.`,
    };
  }

  if (scope === "merchant") {
    await prisma.merchantCategoryRule.upsert({
      where: {
        userId_merchantPattern: {
          userId,
          merchantPattern: normMerchant,
        },
      },
      update: {
        categoryName: targetCategory,
        isAutoLearned: false,
      },
      create: {
        userId,
        merchantPattern: normMerchant,
        categoryName: targetCategory,
        isAutoLearned: false,
      },
    });

    // Find all matching transactions from the provided ledger
    const matchingTxIds = allTransactions
      .filter((t) => {
        const norm = normalizeMerchant(t.merchantName);
        return norm === normMerchant || norm.includes(normMerchant) || normMerchant.includes(norm);
      })
      .map((t) => t.id);

    if (!matchingTxIds.includes(transactionId)) {
      matchingTxIds.push(transactionId);
    }

    // Persist overrides for ALL matching transactions from this merchant so stale overrides don't block rule
    for (const mId of matchingTxIds) {
      await prisma.transactionCategoryOverride.upsert({
        where: {
          userId_transactionId: {
            userId,
            transactionId: mId,
          },
        },
        update: { categoryName: targetCategory },
        create: {
          userId,
          transactionId: mId,
          categoryName: targetCategory,
        },
      });
    }

    return {
      scope: "merchant",
      updatedTransactionIds: matchingTxIds,
      ruleCreated: { pattern: normMerchant, category: targetCategory },
      message: `Rule saved: All past & future transactions from '${merchantName}' (${matchingTxIds.length} items) are now categorized as '${targetCategory}'.`,
    };
  }

  // scope === 'similar' (AI Semantic Similarity)
  // 1. Establish the merchant rule for this primary merchant first
  await prisma.merchantCategoryRule.upsert({
    where: {
      userId_merchantPattern: {
        userId,
        merchantPattern: normMerchant,
      },
    },
    update: {
      categoryName: targetCategory,
      isAutoLearned: false,
    },
    create: {
      userId,
      merchantPattern: normMerchant,
      categoryName: targetCategory,
      isAutoLearned: false,
    },
  });

  // Include primary transaction and all identical-merchant transactions
  const sameMerchantTxIds = allTransactions
    .filter((t) => {
      const norm = normalizeMerchant(t.merchantName);
      return norm === normMerchant || norm.includes(normMerchant) || normMerchant.includes(norm);
    })
    .map((t) => t.id);

  const updatedIdsSet = new Set<string>([transactionId, ...sameMerchantTxIds]);

  // 2. Identify candidate transactions from the ledger that might be semantically similar (AI-only, zero fallback)
  const otherTxs = allTransactions.filter((t) => !updatedIdsSet.has(t.id));
  let similarityWarning: string | undefined = undefined;

  if (otherTxs.length > 0) {
    const similarResult = await findSemanticallySimilarTransactionsWithGemini(
      merchantName,
      targetCategory,
      otherTxs
    );

    if (similarResult.warning) {
      similarityWarning = similarResult.warning;
    }

    for (const simId of similarResult.ids) {
      updatedIdsSet.add(simId);
    }
  }

  const updatedIds = Array.from(updatedIdsSet);

  // 3. Persist overrides for ALL matching and similar transactions across the user's ledger
  for (const id of updatedIds) {
    await prisma.transactionCategoryOverride.upsert({
      where: {
        userId_transactionId: {
          userId,
          transactionId: id,
        },
      },
      update: { categoryName: targetCategory },
      create: {
        userId,
        transactionId: id,
        categoryName: targetCategory,
      },
    });
  }

  return {
    scope: "similar",
    updatedTransactionIds: updatedIds,
    similarCount: updatedIds.length - 1,
    ruleCreated: { pattern: normMerchant, category: targetCategory },
    warning: similarityWarning,
    message: similarityWarning
      ? `Applied '${targetCategory}' to '${merchantName}' (${updatedIds.length} item${updatedIds.length === 1 ? "" : "s"}). ${similarityWarning}`
      : `Applied '${targetCategory}' to '${merchantName}' and reclassified ${updatedIds.length} matching & semantically similar transactions across your ledger.`,
  };
}

/**
 * Prompts Gemini AI to dynamically find semantically similar vendor transactions in the active ledger.
 * Strictly AI-only with zero heuristic/stem fallback.
 */
async function findSemanticallySimilarTransactionsWithGemini(
  anchorMerchant: string,
  targetCategory: string,
  candidateTransactions: Array<{ id: string; merchantName: string; memo?: string; amount: number }>
): Promise<{ ids: string[]; warning?: string }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECONDARY;
  if (!apiKey || apiKey === "your-gemini-api-key") {
    return {
      ids: [],
      warning: "AI similarity matching is unconfigured (missing Gemini API key); only the selected merchant was updated.",
    };
  }

  const validCandidateIds = new Set(candidateTransactions.map((t) => t.id));

  const prompt = `
You are PocketMate's Financial Classification Engine.
The user just categorized merchant "${anchorMerchant}" into category "${targetCategory}".
Review the following candidate transactions from their ledger:

${JSON.stringify(
  candidateTransactions.map((t) => ({
    id: t.id,
    merchant: t.merchantName,
    memo: t.memo || null,
    amount: t.amount,
  })),
  null,
  2
)}

TASK:
Identify ONLY transactions that are genuinely SEMANTICALLY SIMILAR in vendor nature to "${anchorMerchant}" (e.g., other coffee shops, other restaurants, other hotels/airlines, other gyms/fitness studios, other streaming services) and truly belong in "${targetCategory}".
Do NOT match unrelated businesses or P2P transfers simply because of generic words.

OUTPUT SCHEMA:
Return ONLY valid JSON with an array of matching transaction IDs:
{
  "similarTransactionIds": ["id1", "id2"]
}
`;

  try {
    const res = await callGeminiApi({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
      timeoutMs: 12000,
    });

    if (!res.ok) {
      return {
        ids: [],
        warning: `AI similarity service returned HTTP ${res.status}; only the selected merchant was updated.`,
      };
    }
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return {
        ids: [],
        warning: "AI similarity service returned an empty response; only the selected merchant was updated.",
      };
    }

    const parsed = JSON.parse(rawText) as { similarTransactionIds?: string[] };
    if (Array.isArray(parsed.similarTransactionIds)) {
      return {
        ids: parsed.similarTransactionIds.filter((id) => validCandidateIds.has(id)),
      };
    }
    return {
      ids: [],
      warning: "AI similarity response was invalid; only the selected merchant was updated.",
    };
  } catch {
    return {
      ids: [],
      warning: "AI similarity check failed or timed out; only the selected merchant was updated.",
    };
  }
}

/**
 * Reinitializes a category by removing stale merchant rules and overrides,
 * triggering a clean AI re-evaluation for affected transactions.
 */
export async function reinitializeCategory(
  userId: string,
  oldCategoryName: string,
  _newCategoryName?: string
): Promise<{ success: boolean; rulesRemoved: number; overridesReset: number }> {
  void _newCategoryName;
  const [delRules, delOverrides] = await Promise.all([
    prisma.merchantCategoryRule.deleteMany({
      where: {
        userId,
        categoryName: { equals: oldCategoryName, mode: "insensitive" },
      },
    }),
    prisma.transactionCategoryOverride.deleteMany({
      where: {
        userId,
        categoryName: { equals: oldCategoryName, mode: "insensitive" },
      },
    }),
  ]);

  return {
    success: true,
    rulesRemoved: delRules.count,
    overridesReset: delOverrides.count,
  };
}
