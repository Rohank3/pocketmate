"use client";

import React, { useState, useRef, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  Wallet,
  Users,
  BarChart3,
  Send,
  Filter,
  CheckCircle2,
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

interface DebtorSummary {
  name: string;
  totalOwed: number;
  count: number;
  sampleMerchant: string;
}

export const FunctionalMetricsRow: React.FC<FunctionalMetricsRowProps> = ({
  categories,
  transactions,
  events: _events,
  currentUser: _currentUser,
  activeScope: _activeScope,
  onNavigateTab,
  onFilterLedger,
  onSendChatMessage,
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

  // ==========================================
  // 2. CARD 2: FRIENDS OWE YOU
  // ==========================================
  const { debtorList, totalFriendsOwe, totalPendingCount } = useMemo(() => {
    const debtorPendingTxs = transactions.filter(
      (t) =>
        (t.status === "pending" || t.status === "disputed" || t.status === "unresolved") &&
        t.debtor_name &&
        t.debtor_name !== "Self" &&
        t.debtor_name !== "—" &&
        t.debtor_name !== "Unassigned"
    );

    const map = new Map<string, DebtorSummary>();
    debtorPendingTxs.forEach((t) => {
      const name = t.debtor_name;
      const existing = map.get(name);
      if (existing) {
        existing.totalOwed += t.amount;
        existing.count += 1;
      } else {
        map.set(name, {
          name,
          totalOwed: t.amount,
          count: 1,
          sampleMerchant: t.merchant,
        });
      }
    });

    const list = Array.from(map.values()).sort((a, b) => b.totalOwed - a.totalOwed);
    const sum = list.reduce((acc, d) => acc + d.totalOwed, 0);
    const count = list.reduce((acc, d) => acc + d.count, 0);

    return { debtorList: list, totalFriendsOwe: sum, totalPendingCount: count };
  }, [transactions]);

  return (
    <div ref={containerRef} className="relative mb-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* CARD 1: Total Monthly Budget */}
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

        {/* CARD 2: Friends Owe You */}
        <div
          onMouseEnter={() => handleMouseEnter(2)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleCardClick(2)}
          className={`relative p-4 rounded-xl bg-zinc-900/80 border transition-all duration-200 cursor-pointer shadow-sm select-none ${
            isFlyoutOpen(2)
              ? "border-amber-500/50 bg-zinc-900 shadow-amber-500/10 ring-1 ring-amber-500/30"
              : "border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90"
          }`}
          role="button"
          tabIndex={0}
          aria-expanded={isFlyoutOpen(2)}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-xs text-zinc-400 font-medium">Friends Owe You</p>
              <p className="text-lg font-bold text-amber-400 font-mono mt-0.5 tracking-tight truncate">
                ${totalFriendsOwe.toFixed(2)} Owed
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                {debtorList.length > 0
                  ? `${debtorList.length} friend${debtorList.length > 1 ? "s" : ""} (${totalPendingCount} pending splits)`
                  : "All balances settled"}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </div>

          {/* Popover Flyout for Card 2 */}
          {isFlyoutOpen(2) && (
            <div
              onMouseEnter={() => handleMouseEnter(2)}
              onMouseLeave={handleMouseLeave}
              className="absolute left-0 sm:left-auto lg:left-0 top-[calc(100%+8px)] w-80 sm:w-96 p-4 rounded-xl bg-zinc-950/95 border border-zinc-700 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                    Debtor Balances & Splits
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400">
                  ${totalFriendsOwe.toFixed(2)} Total
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2.5 max-h-60 overflow-y-auto pr-1">
                {debtorList.length === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                    <p className="text-xs font-semibold text-zinc-200">All Balances Settled!</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      No friends currently owe money on shared expenses.
                    </p>
                  </div>
                ) : (
                  debtorList.map((debtor) => (
                    <div
                      key={debtor.name}
                      className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                          {debtor.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-200 truncate">{debtor.name}</p>
                          <p className="text-[10px] text-zinc-400 truncate">
                            {debtor.count} pending item{debtor.count > 1 ? "s" : ""} · {debtor.sampleMerchant}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold font-mono text-amber-400">
                          ${debtor.totalOwed.toFixed(2)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            title="Filter ledger for this debtor"
                            onClick={() => {
                              onFilterLedger(debtor.name);
                              onNavigateTab("transactions");
                              setActiveFlyout(null);
                              setPinnedFlyout(null);
                            }}
                            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          >
                            <Filter className="w-3 h-3" />
                          </button>
                          <button
                            title="Ask PocketMate to draft payment reminder"
                            onClick={() => {
                              onSendChatMessage(
                                `PocketMate, please draft and send a friendly payment reminder to ${debtor.name} for $${debtor.totalOwed.toFixed(2)} owed on split expenses.`
                              );
                              setActiveFlyout(null);
                              setPinnedFlyout(null);
                            }}
                            className="p-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {debtorList.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-zinc-800 text-[11px] text-zinc-500 flex items-center justify-between">
                  <span>Click filter icon to view records</span>
                  <span>Click send to remind</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
