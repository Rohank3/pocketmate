export interface BudgetMetricCategoryInput {
  name: string;
}

export interface BudgetMetricTransactionInput {
  category?: string | null;
  amount?: number | null;
  status?: string | null;
  direction?: string | null;
  isOutgoingSplit?: boolean | null;
}

export interface CategorySpendBucket {
  outflow: number;
  inflow: number;
  spent: number;
  count: number;
}

export interface CategorySpendingSummary {
  byCategory: Record<string, CategorySpendBucket>;
  matchedTotalSpent: number;
  totalSpent: number;
  totalCount: number;
}

const EXCLUDED_CATEGORIES = new Set(["income", "revenue"]);

/**
 * Determines whether a ledger transaction contributes to realized budget spending or category offsets.
 * Excludes general income/revenue, pending split receivables (`To receive` / `outgoing_split`),
 * and any unsettled (`pending`, `disputed`, `unresolved`) invoices whose cash has not settled.
 */
export function isBudgetExpenseTransaction(tx: BudgetMetricTransactionInput): boolean {
  const catKey = (tx.category || "Uncategorized").trim().toLowerCase();
  if (EXCLUDED_CATEGORIES.has(catKey)) {
    return false;
  }

  const isUnpaidSplitReceivable =
    tx.direction === "outgoing_split" ||
    (tx.isOutgoingSplit === true && tx.direction !== "incoming");
  if (isUnpaidSplitReceivable) {
    return false;
  }

  const normalizedStatus = (tx.status || "").trim().toLowerCase();
  if (normalizedStatus && normalizedStatus !== "settled" && normalizedStatus !== "completed") {
    return false;
  }

  return true;
}

function resolveCategoryKey(rawCatKey: string, categoryKeys: string[]): string {
  if (categoryKeys.includes(rawCatKey)) {
    return rawCatKey;
  }
  const fuzzyMatch = categoryKeys.find(
    (key) => key.includes(rawCatKey) || rawCatKey.includes(key)
  );
  return fuzzyMatch ?? rawCatKey;
}

/**
 * Computes net realized expenditure (`Math.max(0, outflow - inflow)`) per category and across the ledger.
 * Settled incoming split reimbursements or category refunds offset their matching category's outflow.
 */
export function computeCategorySpending(
  categories: BudgetMetricCategoryInput[],
  transactions: BudgetMetricTransactionInput[]
): CategorySpendingSummary {
  const normalizedCategoryKeys = Array.from(
    new Set(
      categories
        .map((c) => (c.name || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const byCategory: Record<string, CategorySpendBucket> = {};
  for (const key of normalizedCategoryKeys) {
    byCategory[key] = { outflow: 0, inflow: 0, spent: 0, count: 0 };
  }

  let totalCount = 0;

  for (const tx of transactions) {
    if (!isBudgetExpenseTransaction(tx)) {
      continue;
    }

    const amount = Number(tx.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const rawCatKey = (tx.category || "Uncategorized").trim().toLowerCase() || "uncategorized";
    const targetKey = resolveCategoryKey(rawCatKey, normalizedCategoryKeys);

    if (!byCategory[targetKey]) {
      byCategory[targetKey] = { outflow: 0, inflow: 0, spent: 0, count: 0 };
    }

    if (tx.direction === "incoming") {
      byCategory[targetKey].inflow += amount;
    } else {
      byCategory[targetKey].outflow += amount;
      byCategory[targetKey].count += 1;
      totalCount += 1;
    }
  }

  let matchedTotalSpent = 0;
  let totalSpent = 0;
  const configuredSet = new Set(normalizedCategoryKeys);

  for (const [key, bucket] of Object.entries(byCategory)) {
    bucket.spent = Math.max(0, bucket.outflow - bucket.inflow);
    totalSpent += bucket.spent;
    if (configuredSet.has(key)) {
      matchedTotalSpent += bucket.spent;
    }
  }

  return {
    byCategory,
    matchedTotalSpent,
    totalSpent,
    totalCount,
  };
}
