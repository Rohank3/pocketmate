"use client";

import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isBatchApplying && !processingId) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isBatchApplying, processingId, onClose]);

  if (!isOpen) return null;

  // Filter uncategorized records
  const uncategorizedItems = transactions.filter(
    (t) =>
      !recentlyCategorized[t.id] &&
      (t.category.toLowerCase() === "uncategorized" || !t.category || t.category === "—")
  );

  const activeCategoryList = categories;

  // Dynamically resolve category from active user categories without hardcoded merchant heuristics
  const getSmartSuggestion = (t: UncategorizedTx): string => {
    if (t.category && t.category.toLowerCase() !== "uncategorized" && t.category !== "—") {
      return t.category;
    }
    return activeCategoryList[0]?.name || "";
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
    <div
      className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => {
        if (!isBatchApplying && !processingId) onClose();
      }}
    >
      <div
        className="theme-modal rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prominent Liquid Flow Animation */}
        <div className="absolute top-0 left-0 right-0 z-10 liquid-bar" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b theme-modal-header mt-[3px]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]">
              <Tag className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--fg-primary)]">
                Triage Uncategorized
              </h3>
              {uncategorizedItems.length > 0 && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--status-info-bg)] text-[var(--status-info-text)] border border-[var(--status-info-border)] font-medium">
                  {uncategorizedItems.length} left
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] p-1.5 rounded-lg hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Batch Actions Bar */}
        {uncategorizedItems.length > 0 && activeCategoryList.length > 0 && (
          <div className="flex items-center justify-between px-6 py-2.5 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-xs">
            <span className="text-[var(--fg-muted)]">
              {completedCount > 0 ? (
                <span className="text-[var(--status-success-text)] font-semibold">
                  ✓ {completedCount} updated
                </span>
              ) : (
                "Select a category per record"
              )}
            </span>
            <button
              onClick={handleApplyAllSuggestions}
              disabled={isBatchApplying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl theme-btn-primary active:scale-95 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              {isBatchApplying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Apply All ({uncategorizedItems.length})</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Scrollable Transaction List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {uncategorizedItems.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-[var(--status-success-bg)] border border-[var(--status-success-border)] flex items-center justify-center text-[var(--status-success-text)] mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-[var(--fg-primary)] mb-4">
                All Categorized
              </h4>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl theme-btn-primary active:scale-95 text-xs font-bold transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            uncategorizedItems.map((item) => {
              const suggestedCategory = getSmartSuggestion(item);
              const isProcessing = processingId === item.id;

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl theme-card-inset border hover:border-[var(--accent-border)] transition-all flex flex-col gap-2.5"
                >
                  {/* Top row: Merchant, Memo, Date & Amount */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--fg-primary)] truncate">
                          {item.merchant}
                        </span>
                        <span className="text-[11px] text-[var(--fg-muted)] font-mono">
                          {item.date}
                        </span>
                      </div>
                      {item.memo && item.memo.toLowerCase() !== item.merchant.toLowerCase() && (
                        <p className="text-[11px] text-[var(--fg-muted)] truncate mt-0.5">
                          &ldquo;{item.memo}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold font-mono tabular-nums text-[var(--fg-primary)]">
                        ${item.amount.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Category Assignment Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
                    {activeCategoryList.length === 0 ? (
                      <span className="text-[11px] text-[var(--fg-muted)]">
                        Create a budget category first to assign transactions.
                      </span>
                    ) : (
                      <>
                        {suggestedCategory && (
                          <button
                            onClick={() => handleSelectCategory(item, suggestedCategory)}
                            disabled={isProcessing || isBatchApplying}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--status-info-bg)] text-[var(--status-info-text)] hover:bg-[var(--accent-subtle-hover)] border border-[var(--status-info-border)] transition-all cursor-pointer disabled:opacity-50"
                            title={`Accept: ${suggestedCategory}`}
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{suggestedCategory}</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        )}

                        <span className="text-[var(--border-strong)] text-xs px-1">|</span>

                        {activeCategoryList.map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => handleSelectCategory(item, cat.name)}
                            disabled={isProcessing || isBatchApplying}
                            className={`text-[11px] px-2 py-0.5 rounded-md border transition-all cursor-pointer disabled:opacity-50 font-medium ${
                              cat.name === suggestedCategory
                                ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[var(--accent-border)]"
                                : "theme-btn-secondary"
                            }`}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </>
                    )}

                    {isProcessing && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-text)] ml-auto" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--fg-muted)]">
          <span>
            {uncategorizedItems.length} left
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg theme-btn-secondary border font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
