"use client";

import React, { useState, useRef, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  Wallet,
  Users,
  Clock,
  ShieldAlert,
  BarChart3,
  CalendarDays,
  Send,
  Filter,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  CreditCard,
  Tag,
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
  onOpenReviewModal?: () => void;
}

interface DebtorSummary {
  name: string;
  totalOwed: number;
  count: number;
  sampleMerchant: string;
}

interface ActionQueueItem {
  id: string;
  type: "dispute" | "uncategorized" | "debtor" | "budget_breach" | "debt_owed";
  title: string;
  description: string;
  amount?: number;
  severity: "high" | "medium" | "low";
  prompt: string;
  buttonLabel: string;
}

export const FunctionalMetricsRow: React.FC<FunctionalMetricsRowProps> = ({
  categories,
  transactions,
  events,
  currentUser,
  activeScope,
  onNavigateTab,
  onFilterLedger,
  onSendChatMessage,
  onOpenReviewModal,
}) => {
  const [activeFlyout, setActiveFlyout] = useState<number | null>(null);
  const [pinnedFlyout, setPinnedFlyout] = useState<number | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isClient = useSyncExternalStore(
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
    const debtorPendingTxs = transactions.filter((t) => {
      if (!t.debtor_name) return false;
      const d = t.debtor_name.toLowerCase().trim();
      // Exclude self expenses and non-split items
      if (d === "—" || d === "self" || d.includes("self") || d === "unassigned") return false;
      return (
        (t.status === "pending" || t.status === "disputed" || t.status === "unresolved") &&
        (t.splitAllocation === "split" || (!d.includes("self") && d !== "shared split"))
      );
    });

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

  // ==========================================
  // 3. CARD 3: UPCOMING BILLS DUE (MONTHLY)
  // Subscriptions vs. What We Owe Someone
  // ==========================================
  const {
    subscriptionBills,
    personalDebtBills,
    totalSubscriptionsAmount,
    totalPersonalDebtsAmount,
    totalMonthlyDue,
  } = useMemo(() => {
    if (!isClient) {
      return {
        subscriptionBills: [],
        personalDebtBills: [],
        totalSubscriptionsAmount: 0,
        totalPersonalDebtsAmount: 0,
        totalMonthlyDue: 0,
      };
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayDay = now.getDate();

    // Outgoing events for the current month
    const outgoingEvents = events.filter((e) => {
      if (e.type !== "outgoing") return false;
      const dayOfMonth = e.dayOfMonth || (e.date ? parseInt(e.date.slice(8, 10)) : 15);
      const isFutureDay = dayOfMonth > todayDay;
      // Future dates this month are strictly upcoming bills
      if (isFutureDay) return true;
      if (e.status === "completed") return false;
      if (e.date) {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }
      return true; // Recurring monthly rule
    });

    const subs: ScheduledEvent[] = [];
    const debts: ScheduledEvent[] = [];

    outgoingEvents.forEach((ev) => {
      const titleLower = ev.title.toLowerCase();
      const catLower = ev.category.toLowerCase();
      const cpLower = (ev.counterparty || "").toLowerCase();

      const isSub =
        catLower.includes("sub") ||
        catLower.includes("util") ||
        titleLower.includes("netflix") ||
        titleLower.includes("spotify") ||
        titleLower.includes("gym") ||
        titleLower.includes("chatgpt") ||
        titleLower.includes("cloud") ||
        titleLower.includes("aws") ||
        titleLower.includes("wifi") ||
        titleLower.includes("adobe") ||
        titleLower.includes("subscription") ||
        cpLower.includes("start:") ||
        cpLower.includes("ongoing");

      if (isSub) {
        subs.push(ev);
      } else {
        debts.push(ev);
      }
    });

    // Also include transactions where currentUser is debtor
    const currentUserNameLower = (currentUser?.name || "").toLowerCase().trim();
    if (currentUser && activeScope === "personal") {
      const userOwedTxs = transactions.filter((t) => {
        const d = (t.debtor_name || "").toLowerCase().trim();
        return (
          (t.status === "pending" || t.status === "unresolved") &&
          currentUserNameLower &&
          d.length > 0 &&
          (d.includes(currentUserNameLower) || currentUserNameLower.includes(d))
        );
      });

      userOwedTxs.forEach((tx) => {
        debts.push({
          id: `tx_owed_${tx.id}`,
          title: `Owed for ${tx.merchant}`,
          amount: tx.amount,
          date: tx.date.slice(0, 10),
          dayOfMonth: parseInt(tx.date.slice(8, 10)) || 15,
          type: "outgoing",
          category: tx.category,
          counterparty: tx.merchant,
          status: "pending",
        });
      });
    }

    const subTotal = subs.reduce((sum, s) => sum + s.amount, 0);
    const debtTotal = debts.reduce((sum, d) => sum + d.amount, 0);

    return {
      subscriptionBills: subs,
      personalDebtBills: debts,
      totalSubscriptionsAmount: subTotal,
      totalPersonalDebtsAmount: debtTotal,
      totalMonthlyDue: subTotal + debtTotal,
    };
  }, [events, transactions, currentUser, activeScope, isClient]);

  // ==========================================
  // 4. CARD 4: ACTION REQUIRED (TRIAGE LIST)
  // ==========================================
  const actionItems = useMemo<ActionQueueItem[]>(() => {
    const queue: ActionQueueItem[] = [];

    // A. Disputed transactions / split mismatches
    const disputed = transactions.filter((t) => t.status === "disputed");
    disputed.forEach((t) => {
      queue.push({
        id: `dispute_${t.id}`,
        type: "dispute",
        title: `Disputed Split: ${t.merchant}`,
        description: `Split mismatch flag on $${t.amount.toFixed(2)} with ${t.debtor_name || "debtor"}.`,
        amount: t.amount,
        severity: "high",
        prompt: `PocketMate, please analyze and resolve the disputed split on ${t.merchant} for $${t.amount.toFixed(2)} (Debtor: ${t.debtor_name}).`,
        buttonLabel: "Resolve with Agent",
      });
    });

    // B. Breached category budgets
    categoryBars.forEach((cat) => {
      if (cat.isOver) {
        const diff = cat.spent - cat.monthlyCap;
        queue.push({
          id: `budget_${cat.id}`,
          type: "budget_breach",
          title: `${cat.name} Cap Breached`,
          description: `Spent $${cat.spent.toFixed(2)} which exceeds $${cat.monthlyCap.toFixed(0)} cap by $${diff.toFixed(2)}.`,
          amount: diff,
          severity: "high",
          prompt: `PocketMate, my ${cat.name} budget has breached its $${cat.monthlyCap} cap by $${diff.toFixed(2)}. Please review category transactions and suggest cost optimizations.`,
          buttonLabel: "Audit Spending",
        });
      }
    });

    // C. Uncategorized transactions
    const uncat = transactions.filter(
      (t) => t.category === "Uncategorized" || t.category === "uncategorized" || !t.category
    );
    if (uncat.length > 0) {
      queue.push({
        id: "uncat_batch",
        type: "uncategorized",
        title: `${uncat.length} Uncategorized Record${uncat.length > 1 ? "s" : ""}`,
        description: `${uncat.slice(0, 2).map((t) => t.merchant).join(", ")}${uncat.length > 2 ? "..." : ""} need category tagging.`,
        severity: "medium",
        prompt: `PocketMate, please automatically suggest and assign categories for all ${uncat.length} uncategorized transactions in my ledger.`,
        buttonLabel: "AI Auto-Categorize",
      });
    }

    // D. Unassigned debtor splits
    const unassigned = transactions.filter((t) => t.debtor_name === "Unassigned");
    if (unassigned.length > 0) {
      queue.push({
        id: "unassigned_batch",
        type: "debtor",
        title: `${unassigned.length} Unassigned Debtor Split${unassigned.length > 1 ? "s" : ""}`,
        description: `Shared expenses pending debtor assignment (${unassigned.slice(0, 2).map((t) => t.merchant).join(", ")}).`,
        severity: "medium",
        prompt: `PocketMate, please help assign debtors and calculate fair splits for the ${unassigned.length} unassigned shared transactions.`,
        buttonLabel: "Assign Debtors",
      });
    }

    // E. Pending personal debts
    if (personalDebtBills.length > 0) {
      const urgentDebt = personalDebtBills[0];
      queue.push({
        id: `debt_urgent_${urgentDebt.id}`,
        type: "debt_owed",
        title: `Pending Debt: ${urgentDebt.counterparty || urgentDebt.title}`,
        description: `$${urgentDebt.amount.toFixed(2)} due to ${urgentDebt.counterparty || "peer"}.`,
        amount: urgentDebt.amount,
        severity: "high",
        prompt: `PocketMate, please initiate payment review for the pending debt of $${urgentDebt.amount.toFixed(2)} to ${urgentDebt.counterparty || urgentDebt.title}.`,
        buttonLabel: "Settle via PayPal",
      });
    }

    return queue;
  }, [transactions, categoryBars, personalDebtBills]);

  return (
    <div ref={containerRef} className="relative mb-6">
      {/* 4 Responsive Actionable Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* ========================================================= */}
        {/* CARD 1: Total Monthly Budget (Unaffected by Selection)   */}
        {/* ========================================================= */}
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

        {/* ========================================================= */}
        {/* CARD 2: Friends Owe You (Breakdown on Hover)              */}
        {/* ========================================================= */}
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
              {/* Header */}
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

              {/* Debtor List */}
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
                          {/* 1-Click Filter Ledger */}
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
                          {/* 1-Click Send Reminder via PocketMate */}
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

              {/* Footer info */}
              {debtorList.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-zinc-800 text-[11px] text-zinc-500 flex items-center justify-between">
                  <span>Click filter icon to view records</span>
                  <span>Click send to remind</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* CARD 3: Upcoming Bills Due (Subscriptions vs We Owe)     */}
        {/* ========================================================= */}
        <div
          onMouseEnter={() => handleMouseEnter(3)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleCardClick(3)}
          className={`relative p-4 rounded-xl bg-zinc-900/80 border transition-all duration-200 cursor-pointer shadow-sm select-none ${
            isFlyoutOpen(3)
              ? "border-blue-500/50 bg-zinc-900 shadow-blue-500/10 ring-1 ring-blue-500/30"
              : "border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90"
          }`}
          role="button"
          tabIndex={0}
          aria-expanded={isFlyoutOpen(3)}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-xs text-zinc-400 font-medium">Upcoming Bills Due</p>
              <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5 tracking-tight truncate">
                ${totalMonthlyDue.toFixed(2)} Due
              </p>
              {/* Dual Summary Badges directly on Card Face */}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/20 font-mono truncate">
                  💳 Subs: ${totalSubscriptionsAmount.toFixed(0)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/20 font-mono truncate">
                  🤝 Owed: ${totalPersonalDebtsAmount.toFixed(0)}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Popover Flyout for Card 3 */}
          {isFlyoutOpen(3) && (
            <div
              onMouseEnter={() => handleMouseEnter(3)}
              onMouseLeave={handleMouseLeave}
              className="absolute right-0 sm:right-auto lg:right-auto top-[calc(100%+8px)] w-80 sm:w-96 p-4 rounded-xl bg-zinc-950/95 border border-zinc-700 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                    Monthly Due Breakdown
                  </span>
                </div>
                <button
                  onClick={() => {
                    onNavigateTab("upcoming");
                    setActiveFlyout(null);
                    setPinnedFlyout(null);
                  }}
                  className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <span>Open Calendar</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-3.5 max-h-64 overflow-y-auto pr-1">
                {/* SECTION 1: Subscriptions */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-blue-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" />
                      Recurring Subscriptions
                    </span>
                    <span className="font-mono text-zinc-400">
                      ${totalSubscriptionsAmount.toFixed(2)}
                    </span>
                  </div>
                  {subscriptionBills.length === 0 ? (
                    <p className="text-[11px] text-zinc-500 italic p-2 bg-zinc-900/60 rounded">
                      No active recurring subscriptions due this month.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {subscriptionBills.map((sub) => (
                        <div
                          key={sub.id}
                          className="p-2 rounded bg-zinc-900 border border-zinc-800/80 flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-200 truncate">{sub.title}</p>
                            <p className="text-[10px] text-zinc-400">
                              Due: {sub.date || `Day ${sub.dayOfMonth}`} · {sub.category}
                            </p>
                          </div>
                          <span className="font-mono font-bold text-zinc-200 shrink-0">
                            ${sub.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SECTION 2: Personal Debts & What We Owe */}
                <div className="pt-2 border-t border-zinc-800/60">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      What We Owe Someone
                    </span>
                    <span className="font-mono text-zinc-400">
                      ${totalPersonalDebtsAmount.toFixed(2)}
                    </span>
                  </div>
                  {personalDebtBills.length === 0 ? (
                    <p className="text-[11px] text-zinc-500 italic p-2 bg-zinc-900/60 rounded">
                      ✨ You do not owe anyone any pending payments.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {personalDebtBills.map((debt) => (
                        <div
                          key={debt.id}
                          className="p-2 rounded bg-zinc-900 border border-zinc-800/80 flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-purple-200 truncate">{debt.title}</p>
                            <p className="text-[10px] text-zinc-400">
                              Recipient: {debt.counterparty || "Peer"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-purple-300">
                              ${debt.amount.toFixed(2)}
                            </span>
                            <button
                              onClick={() => {
                                onSendChatMessage(
                                  `PocketMate, please help settle my pending payment of $${debt.amount.toFixed(2)} for ${debt.title}.`
                                );
                                setActiveFlyout(null);
                                setPinnedFlyout(null);
                              }}
                              className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] font-semibold transition-colors"
                            >
                              Settle
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* CARD 4: Action Required (Interactive Triage & AI Prompts) */}
        {/* ========================================================= */}
        <div
          onMouseEnter={() => handleMouseEnter(4)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleCardClick(4)}
          className={`relative p-4 rounded-xl bg-zinc-900/80 border transition-all duration-200 cursor-pointer shadow-sm select-none ${
            isFlyoutOpen(4)
              ? "border-rose-500/50 bg-zinc-900 shadow-rose-500/10 ring-1 ring-rose-500/30"
              : "border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90"
          }`}
          role="button"
          tabIndex={0}
          aria-expanded={isFlyoutOpen(4)}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-xs text-zinc-400 font-medium">Action Required</p>
              <p
                className={`text-lg font-bold font-mono mt-0.5 tracking-tight truncate ${
                  actionItems.length > 0 ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {actionItems.length} {actionItems.length === 1 ? "Item" : "Items"} to Review
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                {actionItems.length > 0 ? (
                  <>
                    {actionItems.filter((a) => a.type === "dispute").length > 0 &&
                      `⚠️ ${actionItems.filter((a) => a.type === "dispute").length} Dispute `}
                    {actionItems.filter((a) => a.type === "uncategorized").length > 0 &&
                      `· Uncategorized `}
                    {actionItems.filter((a) => a.type === "budget_breach").length > 0 &&
                      `· Cap Breached`}
                  </>
                ) : (
                  "✨ All clear! Zero actions pending"
                )}
              </p>
            </div>
            <div
              className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
                actionItems.length > 0
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>

          {/* Popover Flyout for Card 4 */}
          {isFlyoutOpen(4) && (
            <div
              onMouseEnter={() => handleMouseEnter(4)}
              onMouseLeave={handleMouseLeave}
              className="absolute right-0 top-[calc(100%+8px)] w-80 sm:w-96 p-4 rounded-xl bg-zinc-950/95 border border-zinc-700 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                    Action Queue ({actionItems.length})
                  </span>
                </div>
                {actionItems.length > 0 && (
                  <button
                    onClick={() => {
                      onSendChatMessage(
                        "PocketMate, please review and triage all outstanding action items in my ledger."
                      );
                      setActiveFlyout(null);
                      setPinnedFlyout(null);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-semibold transition-colors flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-rose-400" />
                    <span>Triage All with Agent</span>
                  </button>
                )}
              </div>

              {/* Action Items List */}
              <div className="mt-3 flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
                {actionItems.length === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                    <p className="text-xs font-semibold text-zinc-200">All Clear!</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      No disputes, unassigned records, or budget breaches require attention.
                    </p>
                  </div>
                ) : (
                  actionItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                                item.severity === "high"
                                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              }`}
                            >
                              {item.type.replace("_", " ")}
                            </span>
                            <span className="text-xs font-bold text-zinc-100 truncate">
                              {item.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400">{item.description}</p>
                        </div>
                        {item.amount && (
                          <span className="text-xs font-mono font-bold text-rose-400 shrink-0">
                            ${item.amount.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Interactive Button(s) to take action */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        {item.type === "uncategorized" && onOpenReviewModal && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenReviewModal();
                              setActiveFlyout(null);
                              setPinnedFlyout(null);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-blue-600 text-zinc-300 hover:text-white text-xs font-medium transition-all shadow-sm cursor-pointer"
                            title="Open interactive categorization popup"
                          >
                            <Tag className="w-3 h-3 text-blue-400" />
                            <span>Review in Popup ↗</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onSendChatMessage(item.prompt);
                            setActiveFlyout(null);
                            setPinnedFlyout(null);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white text-xs font-medium transition-all shadow-sm cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-rose-400 group-hover:text-white" />
                          <span>{item.buttonLabel}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {actionItems.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-zinc-800 text-[10px] text-zinc-500 text-center">
                  Clicking an action sends an interactive prompt to PocketMate
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
