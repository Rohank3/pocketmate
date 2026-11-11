"use client";

import React, { useState } from "react";
import { Tag, Sparkles, CheckCircle2, Loader2, X } from "lucide-react";

export interface CategoryTriageCardData {
  action?: "CATEGORY_TRIAGE" | string;
  transactionId: string;
  merchantName: string;
  amount?: number;
  date?: string;
  suggestedCategory: string;
  confidence?: number;
  reasoning?: string;
  similarCount?: number;
}

interface CategoryTriageCardProps {
  cardData: CategoryTriageCardData;
  categories?: Array<{ id?: string; name: string; color?: string }>;
  onAssignCategory?: (
    transactionId: string,
    merchantName: string,
    targetCategory: string,
    scope: "single" | "merchant" | "similar"
  ) => Promise<{ success: boolean; message: string; warning?: string; updatedTransactionIds?: string[] }>;
  onRequestCreateCategory?: (initialName: string) => Promise<string | null>;
  onCancel?: () => void;
}

export const CategoryTriageCard: React.FC<CategoryTriageCardProps> = ({
  cardData,
  categories = [],
  onAssignCategory,
  onRequestCreateCategory,
  onCancel,
}) => {
  const [loadingScope, setLoadingScope] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const defaultCat =
    cardData.suggestedCategory && cardData.suggestedCategory !== "Uncategorized"
      ? cardData.suggestedCategory
      : categories[0]?.name || "Uncategorized";
  const [targetCategory, setTargetCategory] = useState<string>(defaultCat);
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [customCategory, setCustomCategory] = useState<string>("");
  const [isCreatingCategory, setIsCreatingCategory] = useState<boolean>(false);

  const handleSetCustomCategory = async () => {
    const trimmed = customCategory.trim();
    if (!trimmed) return;

    if (!onRequestCreateCategory) {
      setTargetCategory(trimmed);
      setCustomCategory("");
      setIsCustom(false);
      return;
    }

    setIsCreatingCategory(true);
    try {
      const createdName = await onRequestCreateCategory(trimmed);
      if (createdName) {
        setTargetCategory(createdName);
        setCustomCategory("");
        setIsCustom(false);
      } else {
        // User cancelled or closed the Add Category modal without saving: undo input and stay on Set / Cancel
        setCustomCategory("");
        setIsCustom(true);
      }
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleScopeSelect = async (scope: "single" | "merchant" | "similar") => {
    if (!onAssignCategory || isCustom || isCreatingCategory) return;
    const effectiveCategory = targetCategory || defaultCat;
    setLoadingScope(scope);
    setWarningMessage(null);

    try {
      const res = await onAssignCategory(
        cardData.transactionId,
        cardData.merchantName,
        effectiveCategory,
        scope
      );
      if (res.warning) {
        setWarningMessage(res.warning);
      }
      setSuccessMessage(res.message || `Categorized as '${effectiveCategory}'.`);
    } catch (err) {
      console.error("[Category Triage Error]", err);
    } finally {
      setLoadingScope(null);
    }
  };

  if (successMessage) {
    return (
      <div className="my-2 p-3.5 rounded-xl border flex flex-col gap-1.5 bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)] text-xs">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-semibold">{successMessage}</span>
        </div>
        {warningMessage && (
          <p className="text-[11px] opacity-85 pl-6">{warningMessage}</p>
        )}
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl shadow-sm text-[var(--fg-primary)] transition-all">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]">
            <Tag className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-[var(--fg-primary)] uppercase tracking-wide">
            Categorize
          </span>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] rounded-md cursor-pointer transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Transaction & Target Category Selection */}
      <div className="py-3 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[var(--fg-primary)] text-sm">
            {cardData.merchantName}
          </span>
          {cardData.amount !== undefined && (
            <span className="font-mono tabular-nums font-bold text-[var(--accent-text)] text-sm">
              ${cardData.amount.toFixed(2)}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs py-1">
          <span className="text-[var(--fg-secondary)] font-medium">Category:</span>
          {!isCustom ? (
            <div className="flex items-center gap-2">
              <select
                value={targetCategory}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setIsCustom(true);
                  } else {
                    setTargetCategory(e.target.value);
                  }
                }}
                className="bg-[var(--surface-elevated)] border border-[var(--border-strong)] hover:border-[var(--accent-border)] text-[var(--fg-primary)] font-semibold px-2.5 py-1.5 rounded-xl focus:outline-none focus:border-[#0070ba] cursor-pointer text-xs transition-colors"
                aria-label="Select target category"
              >
                {cardData.suggestedCategory && cardData.suggestedCategory !== "Uncategorized" && (
                  <option value={cardData.suggestedCategory}>
                    {cardData.suggestedCategory}
                  </option>
                )}
                {targetCategory &&
                  targetCategory !== "Uncategorized" &&
                  targetCategory.toLowerCase() !== (cardData.suggestedCategory || "").toLowerCase() &&
                  !categories.some((c) => c.name.toLowerCase() === targetCategory.toLowerCase()) && (
                    <option value={targetCategory}>{targetCategory}</option>
                  )}
                {categories
                  .filter((c) => c.name.toLowerCase() !== (cardData.suggestedCategory || "").toLowerCase())
                  .map((c) => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                <option value="__custom__" className="font-medium">
                  + Custom...
                </option>
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Category name..."
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSetCustomCategory();
                  }
                }}
                disabled={isCreatingCategory}
                className="bg-[var(--surface-elevated)] border border-[var(--accent-border)] text-[var(--fg-primary)] text-xs px-2.5 py-1 rounded-xl focus:outline-none disabled:opacity-50"
                autoFocus
              />
              <button
                type="button"
                disabled={!customCategory.trim() || isCreatingCategory}
                onClick={() => void handleSetCustomCategory()}
                className="px-2.5 py-1 text-[11px] theme-btn-primary font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              >
                {isCreatingCategory ? "Creating..." : "Set"}
              </button>
              <button
                type="button"
                disabled={isCreatingCategory}
                onClick={() => {
                  setCustomCategory("");
                  setIsCustom(false);
                }}
                className="px-1.5 py-1 text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3 One-Tap Scope Actions */}
      <div className="pt-2.5 border-t border-[var(--border-subtle)] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-[var(--fg-secondary)]">
            Apply to:
          </p>
          {isCustom && (
            <span className="text-[10px] font-medium text-[var(--accent-text)]">
              Click Set to create category first
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Option 1: Only this transaction */}
          <button
            type="button"
            disabled={Boolean(loadingScope) || isCustom || isCreatingCategory}
            onClick={() => handleScopeSelect("single")}
            className="p-2.5 rounded-xl border theme-card-inset hover:border-[var(--accent-border)] text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-semibold text-[var(--fg-primary)] group-hover:text-[var(--accent-text)]">
                This item
              </span>
              {loadingScope === "single" && <Loader2 className="w-3 h-3 animate-spin text-[var(--accent-text)]" />}
            </div>
            <p className="text-[10px] text-[var(--fg-muted)]">Single charge</p>
          </button>

          {/* Option 2: Only this merchant */}
          <button
            type="button"
            disabled={Boolean(loadingScope) || isCustom || isCreatingCategory}
            onClick={() => handleScopeSelect("merchant")}
            className="p-2.5 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-subtle)] hover:bg-[var(--accent-subtle-hover)] text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-semibold text-[var(--accent-text)]">
                This vendor
              </span>
              {loadingScope === "merchant" && <Loader2 className="w-3 h-3 animate-spin text-[var(--accent-text)]" />}
            </div>
            <p className="text-[10px] text-[var(--fg-muted)]">All from merchant</p>
          </button>

          {/* Option 3: All similar */}
          <button
            type="button"
            disabled={Boolean(loadingScope) || isCustom || isCreatingCategory}
            onClick={() => handleScopeSelect("similar")}
            className="p-2.5 rounded-xl border border-[var(--accent-border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent-subtle)] text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-semibold text-[var(--accent-text)] flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                All similar
              </span>
              {loadingScope === "similar" && <Loader2 className="w-3 h-3 animate-spin text-[var(--accent-text)]" />}
            </div>
            <p className="text-[10px] text-[var(--fg-muted)]">Matching records</p>
          </button>
        </div>
      </div>
    </div>
  );
};
