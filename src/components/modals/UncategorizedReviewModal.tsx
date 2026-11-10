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
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white/98 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-amber-300/80 overflow-hidden relative">
        {/* Prominent Liquid Flow Animation */}
        <div className="absolute top-0 left-0 right-0 z-10 liquid-bar" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-amber-50/60 mt-[3.5px]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-center text-amber-800 shadow-2xs">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900">
                  Triage Uncategorized Records
                </h3>
                {uncategorizedItems.length > 0 && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-medium">
                    {uncategorizedItems.length} remaining
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500">
                Assign categories or accept merchant recommendations.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-stone-400 hover:text-zinc-900 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
            title="Close popup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Batch Actions Bar */}
        {uncategorizedItems.length > 0 && (
          <div className="flex items-center justify-between px-6 py-2.5 bg-stone-50 border-b border-stone-200 text-xs">
            <span className="text-stone-600">
              {completedCount > 0 && (
                <span className="text-emerald-700 font-semibold mr-2">
                  ✓ {completedCount} categorized
                </span>
              )}
              Assigning updates persistent merchant rules.
            </span>
            <button
              onClick={handleApplyAllSuggestions}
              disabled={isBatchApplying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-zinc-950 text-xs font-bold shadow-xs border border-amber-400/40 transition-all cursor-pointer disabled:opacity-50"
            >
              {isBatchApplying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying to all...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Apply All Suggestions ({uncategorizedItems.length})</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Scrollable Transaction List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {uncategorizedItems.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-700 mb-3 shadow-2xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-zinc-900">
                All Transactions Categorized!
              </h4>
              <p className="text-xs text-stone-500 max-w-sm mt-1 mb-5">
                Your financial ledger is 100% classified across your active budget ceilings.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-zinc-950 text-xs font-bold shadow-xs border border-amber-400/40 transition-all cursor-pointer"
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
                  className="p-3.5 rounded-xl bg-white border border-stone-200 hover:border-amber-300 transition-all flex flex-col gap-2.5 shadow-2xs"
                >
                  {/* Top row: Merchant, Memo, Date & Amount */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-900 truncate">
                          {item.merchant}
                        </span>
                        <span className="text-[11px] text-stone-500 font-mono">
                          {item.date}
                        </span>
                      </div>
                      {item.memo && item.memo.toLowerCase() !== item.merchant.toLowerCase() && (
                        <p className="text-[11px] text-stone-500 truncate mt-0.5">
                          &ldquo;{item.memo}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold font-mono text-zinc-900">
                        ${item.amount.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Category Assignment Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-stone-100">
                    <button
                      onClick={() => handleSelectCategory(item, suggestedCategory)}
                      disabled={isProcessing || isBatchApplying}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 border border-amber-300/80 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                      title={`Accept recommendation: ${suggestedCategory}`}
                    >
                      <Sparkles className="w-3 h-3 text-amber-700" />
                      <span>Suggested: {suggestedCategory}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-amber-700" />
                    </button>

                    <span className="text-stone-300 text-xs px-1">|</span>

                    {activeCategoryList.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => handleSelectCategory(item, cat.name)}
                        disabled={isProcessing || isBatchApplying}
                        className={`text-[11px] px-2 py-0.5 rounded-md border transition-all cursor-pointer disabled:opacity-50 font-medium ${
                          cat.name === suggestedCategory
                            ? "bg-amber-50 text-amber-900 border-amber-300 shadow-2xs"
                            : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100 hover:text-zinc-900"
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}

                    {isProcessing && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 ml-auto" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-stone-200 bg-stone-50/90 text-xs text-stone-500">
          <span>
            {uncategorizedItems.length} item{uncategorizedItems.length !== 1 ? "s" : ""} left to triage
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-800 font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
