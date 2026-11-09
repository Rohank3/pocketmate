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
  const [targetCategory, setTargetCategory] = useState<string>(cardData.suggestedCategory || "General");
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [customCategory, setCustomCategory] = useState<string>("");

  const handleScopeSelect = async (scope: "single" | "merchant" | "similar") => {
    if (!onAssignCategory) return;
    const effectiveCategory = (isCustom && customCategory.trim()) ? customCategory.trim() : (targetCategory || "General");
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
      <div className="my-2 p-3.5 rounded-xl border flex items-center gap-2.5 bg-emerald-950/30 border-emerald-500/40 text-emerald-200 text-xs">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="font-medium text-emerald-300">{successMessage}</span>
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-xl transition-all">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Tag className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-zinc-100 uppercase tracking-wide">
            Categorization Triage
          </span>
        </div>

        <div className="flex items-center gap-2">
          {cardData.confidence !== undefined && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {(cardData.confidence * 100).toFixed(0)}% Confidence
            </span>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1 text-zinc-500 hover:text-zinc-300 rounded-md cursor-pointer"
              title="Dismiss triage"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Transaction & Detected Category Details */}
      <div className="py-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-100 text-sm">
            {cardData.merchantName}
          </span>
          {cardData.amount !== undefined && (
            <span className="font-mono font-bold text-zinc-200">
              ${cardData.amount.toFixed(2)}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs py-1">
          <span className="text-zinc-400 font-medium">Target Category:</span>
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
                className="bg-zinc-950 border border-zinc-700 hover:border-zinc-500 text-emerald-300 font-semibold px-2.5 py-1 rounded-lg focus:outline-none focus:border-emerald-500 cursor-pointer text-xs transition-colors"
                aria-label="Select target category"
              >
                <option value={cardData.suggestedCategory}>
                  {cardData.suggestedCategory} (Suggested)
                </option>
                {categories
                  .filter((c) => c.name.toLowerCase() !== (cardData.suggestedCategory || "").toLowerCase())
                  .map((c) => (
                    <option key={c.id || c.name} value={c.name} className="bg-zinc-900 text-zinc-200">
                      {c.name}
                    </option>
                  ))}
                <option value="__custom__" className="bg-zinc-900 text-blue-400 font-medium">
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
                className="bg-zinc-950 border border-emerald-500/60 text-zinc-100 text-xs px-2 py-1 rounded-lg focus:outline-none"
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
                className="px-2 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md cursor-pointer transition-colors"
              >
                Set
              </button>
              <button
                type="button"
                onClick={() => setIsCustom(false)}
                className="px-1.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {cardData.reasoning && (
          <p className="text-[11px] text-zinc-400 italic">
            &ldquo;{cardData.reasoning}&rdquo;
          </p>
        )}
      </div>

      {/* 3 One-Tap Scope Actions */}
      <div className="pt-3 border-t border-zinc-800 space-y-2">
        <p className="text-[11px] font-medium text-zinc-400">
          How would you like to apply this category?
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Option 1: Only this transaction */}
          <button
            type="button"
            disabled={Boolean(loadingScope)}
            onClick={() => handleScopeSelect("single")}
            className="p-2.5 rounded-xl border border-zinc-700 bg-zinc-950/70 hover:bg-zinc-800 hover:border-zinc-600 active:bg-zinc-700 text-left transition-all cursor-pointer disabled:opacity-50 group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                This item only
              </span>
              {loadingScope === "single" && <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />}
            </div>
            <p className="text-[10px] text-zinc-500">Only override this single charge</p>
          </button>

          {/* Option 2: Only this merchant */}
          <button
            type="button"
            disabled={Boolean(loadingScope)}
            onClick={() => handleScopeSelect("merchant")}
            className="p-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-950/40 active:bg-emerald-900/40 text-left transition-all cursor-pointer disabled:opacity-50 group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-emerald-300 group-hover:text-emerald-200">
                This merchant
              </span>
              {loadingScope === "merchant" && <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />}
            </div>
            <p className="text-[10px] text-emerald-400/70">Past & future charges for this vendor</p>
          </button>

          {/* Option 3: All similar (Gemini Semantic AI) */}
          <button
            type="button"
            disabled={Boolean(loadingScope)}
            onClick={() => handleScopeSelect("similar")}
            className="p-2.5 rounded-xl border border-blue-500/40 bg-blue-950/20 hover:bg-blue-950/40 active:bg-blue-900/40 text-left transition-all cursor-pointer disabled:opacity-50 group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-blue-300 group-hover:text-blue-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                All similar
              </span>
              {loadingScope === "similar" && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
            </div>
            <p className="text-[10px] text-blue-400/70">Scan ledger for similar vendors</p>
          </button>
        </div>
      </div>
    </div>
  );
};
