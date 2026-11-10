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
  ) => Promise<{ success: boolean; message: string; updatedTransactionIds?: string[] }>;
  onCancel?: () => void;
}

export const CategoryTriageCard: React.FC<CategoryTriageCardProps> = ({
  cardData,
  categories = [],
  onAssignCategory,
  onCancel,
}) => {
  const [loadingScope, setLoadingScope] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const defaultCat =
    cardData.suggestedCategory && cardData.suggestedCategory !== "Uncategorized"
      ? cardData.suggestedCategory
      : categories[0]?.name || "Uncategorized";
  const [targetCategory, setTargetCategory] = useState<string>(defaultCat);
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [customCategory, setCustomCategory] = useState<string>("");

  const handleScopeSelect = async (scope: "single" | "merchant" | "similar") => {
    if (!onAssignCategory) return;
    const effectiveCategory =
      isCustom && customCategory.trim()
        ? customCategory.trim()
        : targetCategory || defaultCat;
    setLoadingScope(scope);

    try {
      const res = await onAssignCategory(
        cardData.transactionId,
        cardData.merchantName,
        effectiveCategory,
        scope
      );
      setSuccessMessage(res.message || `Categorized as '${effectiveCategory}'.`);
    } catch (err) {
      console.error("[Category Triage Error]", err);
    } finally {
      setLoadingScope(null);
    }
  };

  if (successMessage) {
    return (
      <div className="my-2 p-3.5 rounded-xl border flex items-center gap-2.5 bg-amber-500/10 border-amber-400/40 text-amber-900 text-xs shadow-xs">
        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="font-semibold text-amber-900">{successMessage}</span>
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-white border border-amber-200/80 rounded-2xl shadow-sm text-zinc-900 transition-all">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-2.5 border-b border-stone-200/80">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-700">
            <Tag className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-zinc-900 uppercase tracking-wide">
            Categorize Transaction
          </span>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md cursor-pointer transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Transaction & Target Category Selection */}
      <div className="py-3 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-zinc-900 text-sm">
            {cardData.merchantName}
          </span>
          {cardData.amount !== undefined && (
            <span className="font-mono font-bold text-amber-700 text-sm">
              ${cardData.amount.toFixed(2)}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs py-1">
          <span className="text-zinc-600 font-medium">Target Category:</span>
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
                className="bg-stone-50 border border-stone-200 hover:border-amber-400 text-amber-900 font-semibold px-2.5 py-1.5 rounded-xl focus:outline-none focus:border-amber-500 cursor-pointer text-xs transition-colors shadow-2xs"
                aria-label="Select target category"
              >
                {cardData.suggestedCategory && cardData.suggestedCategory !== "Uncategorized" && (
                  <option value={cardData.suggestedCategory}>
                    {cardData.suggestedCategory}
                  </option>
                )}
                {categories
                  .filter((c) => c.name.toLowerCase() !== (cardData.suggestedCategory || "").toLowerCase())
                  .map((c) => (
                    <option key={c.id || c.name} value={c.name} className="bg-white text-zinc-800">
                      {c.name}
                    </option>
                  ))}
                <option value="__custom__" className="bg-white text-amber-700 font-medium">
                  + Enter Custom Category...
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
                className="bg-stone-50 border border-amber-400/80 text-zinc-900 text-xs px-2.5 py-1 rounded-xl focus:outline-none shadow-2xs"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  if (customCategory.trim()) {
                    setTargetCategory(customCategory.trim());
                  }
                  setIsCustom(false);
                }}
                className="px-2.5 py-1 text-[11px] bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold rounded-lg cursor-pointer transition-colors shadow-2xs"
              >
                Set
              </button>
              <button
                type="button"
                onClick={() => setIsCustom(false)}
                className="px-1.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3 One-Tap Scope Actions in Unified Gold & White Luxury Design */}
      <div className="pt-2.5 border-t border-stone-200/80 space-y-2">
        <p className="text-[11px] font-semibold text-zinc-600">
          Apply category to:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Option 1: Only this transaction */}
          <button
            type="button"
            disabled={Boolean(loadingScope)}
            onClick={() => handleScopeSelect("single")}
            className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-white hover:border-amber-400 hover:shadow-2xs text-left transition-all cursor-pointer disabled:opacity-50 group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-zinc-900 group-hover:text-amber-800">
                This item only
              </span>
              {loadingScope === "single" && <Loader2 className="w-3 h-3 animate-spin text-amber-600" />}
            </div>
            <p className="text-[10px] text-zinc-500">Only override this single charge</p>
          </button>

          {/* Option 2: Only this merchant */}
          <button
            type="button"
            disabled={Boolean(loadingScope)}
            onClick={() => handleScopeSelect("merchant")}
            className="p-2.5 rounded-xl border border-amber-300 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-400 hover:shadow-2xs text-left transition-all cursor-pointer disabled:opacity-50 group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-amber-900 group-hover:text-amber-700">
                This merchant
              </span>
              {loadingScope === "merchant" && <Loader2 className="w-3 h-3 animate-spin text-amber-600" />}
            </div>
            <p className="text-[10px] text-amber-800/80">All charges for this vendor</p>
          </button>

          {/* Option 3: All similar */}
          <button
            type="button"
            disabled={Boolean(loadingScope)}
            onClick={() => handleScopeSelect("similar")}
            className="p-2.5 rounded-xl border border-amber-300 bg-amber-50/20 hover:bg-amber-50 hover:border-amber-400 hover:shadow-2xs text-left transition-all cursor-pointer disabled:opacity-50 group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-amber-900 group-hover:text-amber-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-600" />
                All similar
              </span>
              {loadingScope === "similar" && <Loader2 className="w-3 h-3 animate-spin text-amber-600" />}
            </div>
            <p className="text-[10px] text-amber-800/80">All matching ledger records</p>
          </button>
        </div>
      </div>
    </div>
  );
};
