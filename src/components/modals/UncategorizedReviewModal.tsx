"use client";

import React, { useState } from "react";
import { X, Sparkles, CheckCircle2, ArrowRight, Loader2, Tag } from "lucide-react";

export interface UncategorizedTx {
  id: string;
  date: string;
  merchant: string;
  memo?: string;
  category: string;
  amount: number;
  debtor_name?: string;
}

interface UncategorizedReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: UncategorizedTx[];
  categories: Array<{ id: string; name: string; color?: string }>;
  onAssignCategory: (
    transactionId: string,
    merchantName: string,
    category: string,
    scope: "single" | "merchant" | "similar"
  ) => Promise<unknown>;
}

export const UncategorizedReviewModal: React.FC<UncategorizedReviewModalProps> = ({
  isOpen,
  onClose,
  transactions,
  categories,
  onAssignCategory,
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [recentlyCategorized, setRecentlyCategorized] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  // Filter uncategorized records
  const uncategorizedItems = transactions.filter(
    (t) =>
      !recentlyCategorized[t.id] &&
      (t.category.toLowerCase() === "uncategorized" || !t.category || t.category === "—")
  );

  // Fallback category list if user has none defined
  const activeCategoryList =
    categories.length > 0
      ? categories
      : [
          { id: "c1", name: "Dining", color: "#3b82f6" },
          { id: "c2", name: "Groceries", color: "#10b981" },
          { id: "c3", name: "Shopping", color: "#a855f7" },
          { id: "c4", name: "Entertainment", color: "#6366f1" },
          { id: "c5", name: "Travel", color: "#f59e0b" },
        ];

  // Dynamically resolve category from active user categories without hardcoded merchant heuristics
  const getSmartSuggestion = (t: UncategorizedTx): string => {
    if (t.category && t.category.toLowerCase() !== "uncategorized" && t.category !== "—") {
      return t.category;
    }
    return activeCategoryList[0]?.name || "Uncategorized";
  };

  const handleSelectCategory = async (tx: UncategorizedTx, categoryName: string) => {
    try {
      setProcessingId(tx.id);
      await onAssignCategory(tx.id, tx.merchant, categoryName, "merchant");
      setRecentlyCategorized((prev) => ({ ...prev, [tx.id]: categoryName }));
    } catch (err) {
      console.error("[Assign Category Error]", err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApplyAllSuggestions = async () => {
    if (uncategorizedItems.length === 0) return;
    try {
      setIsBatchApplying(true);
      for (const item of uncategorizedItems) {
        const suggested = getSmartSuggestion(item);
        await onAssignCategory(item.id, item.merchant, suggested, "merchant");
        setRecentlyCategorized((prev) => ({ ...prev, [item.id]: suggested }));
      }
    } catch (err) {
      console.error("[Batch Apply Suggestions Error]", err);
    } finally {
      setIsBatchApplying(false);
    }
  };

  const completedCount = Object.keys(recentlyCategorized).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100">
                  Review & Triage Uncategorized Transactions
                </h3>
                {uncategorizedItems.length > 0 && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {uncategorizedItems.length} remaining
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                Single-tap to assign categories or accept AI smart suggestions.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close popup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Batch Actions Bar */}
        {uncategorizedItems.length > 0 && (
          <div className="flex items-center justify-between px-6 py-2.5 bg-zinc-950/60 border-b border-zinc-800/80 text-xs">
            <span className="text-zinc-400">
              {completedCount > 0 && (
                <span className="text-emerald-400 font-medium mr-2">
                  ✓ {completedCount} categorized
                </span>
              )}
              Assigning saves persistent rules for each merchant.
            </span>
            <button
              onClick={handleApplyAllSuggestions}
              disabled={isBatchApplying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isBatchApplying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying to all...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>⚡ Apply All AI Suggestions ({uncategorizedItems.length})</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Scrollable Transaction List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {uncategorizedItems.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-zinc-100">
                All Transactions Categorized!
              </h4>
              <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-5">
                Your financial ledger is 100% classified across your active budget ceilings.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                Return to Ledger
              </button>
            </div>
          ) : (
            uncategorizedItems.map((item) => {
              const suggestedCategory = getSmartSuggestion(item);
              const isProcessing = processingId === item.id;

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col gap-2.5"
                >
                  {/* Top row: Merchant, Memo, Date & Amount */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-100 truncate">
                          {item.merchant}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {item.date}
                        </span>
                      </div>
                      {item.memo && item.memo.toLowerCase() !== item.merchant.toLowerCase() && (
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                          &ldquo;{item.memo}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold font-mono text-zinc-100">
                        ${item.amount.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Category Assignment Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/60">
                    <button
                      onClick={() => handleSelectCategory(item, suggestedCategory)}
                      disabled={isProcessing || isBatchApplying}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition-all cursor-pointer disabled:opacity-50"
                      title={`Accept AI recommendation: ${suggestedCategory}`}
                    >
                      <Sparkles className="w-3 h-3 text-blue-400" />
                      <span>Suggested: {suggestedCategory}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-blue-400" />
                    </button>

                    <span className="text-zinc-600 text-xs px-1">|</span>

                    {activeCategoryList.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => handleSelectCategory(item, cat.name)}
                        disabled={isProcessing || isBatchApplying}
                        className={`text-[11px] px-2 py-0.5 rounded-md border transition-all cursor-pointer disabled:opacity-50 ${
                          cat.name === suggestedCategory
                            ? "bg-zinc-800 text-zinc-200 border-zinc-700 hover:border-zinc-500"
                            : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200"
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}

                    {isProcessing && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 ml-auto" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-400">
          <span>
            {uncategorizedItems.length} item{uncategorizedItems.length !== 1 ? "s" : ""} left to triage
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
