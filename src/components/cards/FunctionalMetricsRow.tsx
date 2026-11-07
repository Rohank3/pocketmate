"use client";

import React, { useState, useRef, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  Wallet,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";
import type { TransactionRow } from "@/components/grid/TransactionGrid";
import type { ScheduledEvent } from "@/components/scheduler/BudgetScheduler";
import type { UserAccount } from "@/types/sandboxUser";

export interface FunctionalMetricsRowProps {
  categories: CategoryItem[];
  transactions: TransactionRow[];
  events: ScheduledEvent[];
  currentUser: UserAccount | null;
  activeScope: "personal" | "all";
  onNavigateTab: (tab: "transactions" | "insights" | "upcoming") => void;
  onFilterLedger: (debtorName?: string, categoryName?: string) => void;
  onSendChatMessage: (prompt: string) => void;
}

export const FunctionalMetricsRow: React.FC<FunctionalMetricsRowProps> = ({
  categories,
  transactions,
  events: _events,
  currentUser: _currentUser,
  activeScope: _activeScope,
  onNavigateTab,
  onFilterLedger: _onFilterLedger,
  onSendChatMessage: _onSendChatMessage,
}) => {
  const [activeFlyout, setActiveFlyout] = useState<number | null>(null);
  const [pinnedFlyout, setPinnedFlyout] = useState<number | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const _isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Close flyouts on Escape key or outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveFlyout(null);
        setPinnedFlyout(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveFlyout(null);
        setPinnedFlyout(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleMouseEnter = (cardIndex: number) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setActiveFlyout(cardIndex);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      if (pinnedFlyout === null) {
        setActiveFlyout(null);
      }
    }, 220);
  };

  const handleCardClick = (cardIndex: number) => {
    if (pinnedFlyout === cardIndex) {
      setPinnedFlyout(null);
      setActiveFlyout(null);
    } else {
      setPinnedFlyout(cardIndex);
      setActiveFlyout(cardIndex);
    }
  };

  const isFlyoutOpen = (cardIndex: number) => {
    return pinnedFlyout === cardIndex || activeFlyout === cardIndex;
  };

  // ==========================================
  // 1. CARD 1: TOTAL MONTHLY BUDGET (GLOBAL)
  // ==========================================
  const { totalSpent, totalBudgetCap, isBudgetOver, budgetPercentUsed, remainingBudget, categoryBars } =
    useMemo(() => {
      const spent = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
      const cap = categories.reduce((sum, c) => sum + (c.monthlyCap || 0), 0);
      const over = spent > cap;
      const percent = cap > 0 ? Math.round((spent / cap) * 100) : 0;
      const remaining = cap - spent;

      // Category breakdown for hover bar chart
      const catSpendMap: Record<string, number> = {};
      transactions.forEach((tx) => {
        const catName = (tx.category || "Uncategorized").toLowerCase();
        catSpendMap[catName] = (catSpendMap[catName] || 0) + tx.amount;
      });

      const bars = categories.map((cat) => {
        const catSpent = catSpendMap[cat.name.toLowerCase()] || 0;
        const catPercent = cat.monthlyCap > 0 ? Math.round((catSpent / cat.monthlyCap) * 100) : 0;
        const barWidth = Math.min(100, catPercent);
        const catOver = catSpent > cat.monthlyCap;
        return {
          id: cat.id,
          name: cat.name,
          color: cat.color || "#3b82f6",
          monthlyCap: cat.monthlyCap,
          spent: catSpent,
          percent: catPercent,
          barWidth,
          isOver: catOver,
        };
      });

      return {
        totalSpent: spent,
        totalBudgetCap: cap,
        isBudgetOver: over,
        budgetPercentUsed: percent,
        remainingBudget: remaining,
        categoryBars: bars,
      };
    }, [transactions, categories]);

  return (
    <div ref={containerRef} className="relative mb-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* CARD 1: Total Monthly Budget (Unaffected by Selection) */}
        <div
          onMouseEnter={() => handleMouseEnter(1)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleCardClick(1)}
          className={`relative p-4 rounded-xl bg-zinc-900/80 border transition-all duration-200 cursor-pointer shadow-sm select-none ${
            isFlyoutOpen(1)
              ? "border-emerald-500/50 bg-zinc-900 shadow-emerald-500/10 ring-1 ring-emerald-500/30"
              : "border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90"
          }`}
          role="button"
          tabIndex={0}
          aria-expanded={isFlyoutOpen(1)}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-zinc-400 font-medium">Total Monthly Budget</p>
                <span className="text-[10px] text-zinc-500 px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700/60 font-mono">
                  Global
                </span>
              </div>
              <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5 tracking-tight truncate">
                ${totalSpent.toFixed(2)}{" "}
                <span className="text-zinc-500 text-sm font-normal">/ ${totalBudgetCap.toFixed(0)}</span>
              </p>
              <p
                className={`text-[11px] mt-0.5 truncate ${
                  isBudgetOver ? "text-rose-400 font-medium" : "text-emerald-400"
                }`}
              >
                {isBudgetOver
                  ? `⚠️ $${Math.abs(remainingBudget).toFixed(2)} over ceiling (${budgetPercentUsed}%)`
                  : `✅ $${remainingBudget.toFixed(2)} remaining (${budgetPercentUsed}% used)`}
              </p>
            </div>
            <div
              className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 transition-transform ${
                isBudgetOver
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              }`}
            >
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          {/* Popover Flyout for Card 1 */}
          {isFlyoutOpen(1) && (
            <div
              onMouseEnter={() => handleMouseEnter(1)}
              onMouseLeave={handleMouseLeave}
              className="absolute left-0 top-[calc(100%+8px)] w-80 sm:w-96 p-4 rounded-xl bg-zinc-950/95 border border-zinc-700 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Flyout Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                    Budget vs. Expenditure
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {budgetPercentUsed}% Used
                </span>
              </div>

              {/* Overall Progress Bar */}
              <div className="mt-3 mb-4">
                <div className="flex justify-between text-xs mb-1 font-mono">
                  <span className="text-zinc-400">Total Spent</span>
                  <span className="text-zinc-200 font-bold">
                    ${totalSpent.toFixed(2)} of ${totalBudgetCap.toFixed(2)}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      isBudgetOver
                        ? "bg-rose-500"
                        : budgetPercentUsed > 80
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, budgetPercentUsed)}%` }}
                  />
                </div>
              </div>

              {/* Category-by-Category Horizontal Comparative Bar Chart */}
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">
                Category Spending Caps
              </p>
              <div className="flex flex-col gap-2.5 max-h-56 overflow-y-auto pr-1">
                {categoryBars.map((cat) => (
                  <div key={cat.id} className="flex flex-col gap-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-medium text-zinc-200 truncate">{cat.name}</span>
                        {cat.isOver && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Breached
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-zinc-400 text-[11px] shrink-0">
                        ${cat.spent.toFixed(0)} / ${cat.monthlyCap}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${cat.barWidth}%`,
                          backgroundColor: cat.isOver ? "#f43f5e" : cat.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Shortcut to full Studio */}
              <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">Live analytics</span>
                <button
                  onClick={() => {
                    onNavigateTab("insights");
                    setActiveFlyout(null);
                    setPinnedFlyout(null);
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <span>Open Full Insights</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
