"use client";

import React, { useMemo, useState } from "react";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  PieChart,
  BarChart2,
  Users,
  ArrowUpRight,
} from "lucide-react";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";
import type { TransactionRow } from "@/components/grid/TransactionGrid";
import type { UserAccount } from "@/types/sandboxUser";
import { ensureUniqueCategoryColors } from "@/lib/utils/categoryColors";
import { computeCategorySpending, isBudgetExpenseTransaction } from "@/lib/utils/budgetMetrics";

export interface FinancialStudioProps {
  categories?: CategoryItem[];
  transactions?: TransactionRow[];
  currentUser?: UserAccount | null;
  splits?: Array<{
    id: string;
    description: string;
    items?: Array<{
      participantName: string;
      participantEmail?: string;
      amount: number;
      status: string;
    }>;
  }>;
  onActionClick?: (message: string) => void;
}

export default function FinancialStudio({
  categories = [],
  transactions = [],
  currentUser = null,
  splits = [],
  onActionClick,
}: FinancialStudioProps) {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  // 1. Calculate spending per category
  const categoryAnalytics = useMemo(() => {
    // 1a. Ensure all categories have distinct unique colors and incorporate any ad-hoc transaction categories
    const existingCats = ensureUniqueCategoryColors(categories);
    const existingNames = new Set(existingCats.map((c) => c.name.toLowerCase()));

    const extraCats: Array<{ id: string; name: string; monthlyCap: number; color?: string }> = [];
    for (const tx of transactions) {
      if (!tx.category || !isBudgetExpenseTransaction(tx)) continue;
      const norm = tx.category.trim();
      if (
        norm &&
        norm !== "—" &&
        norm.toLowerCase() !== "uncategorized" &&
        !existingNames.has(norm.toLowerCase())
      ) {
        existingNames.add(norm.toLowerCase());
        extraCats.push({
          id: `cat_dyn_${norm.toLowerCase().replace(/\s+/g, "_")}`,
          name: norm,
          monthlyCap: 300,
        });
      }
    }

    const allCategories = ensureUniqueCategoryColors([...existingCats, ...extraCats]);
    const spendingSummary = computeCategorySpending(allCategories, transactions);

    const items = allCategories.map((cat) => {
      const normKey = cat.name.toLowerCase();
      const bucket = spendingSummary.byCategory[normKey];
      const netSpent = bucket?.spent || 0;

      const isOver = netSpent > cat.monthlyCap;
      const diff = Math.abs(netSpent - cat.monthlyCap);
      const percent = cat.monthlyCap > 0 ? Math.round((netSpent / cat.monthlyCap) * 100) : 0;

      return {
        ...cat,
        spent: netSpent,
        txCount: bucket?.count || 0,
        isOver,
        diff,
        percent,
        shareOfTotal: 0,
      };
    });

    const totalSpent = items.reduce((sum, i) => sum + i.spent, 0);

    const itemsWithShare = items.map((i) => ({
      ...i,
      shareOfTotal: totalSpent > 0 ? Math.round((i.spent / totalSpent) * 100) : 0,
    }));

    const totalCap = categories.reduce((sum, c) => sum + c.monthlyCap, 0);
    const overallPercent = totalCap > 0 ? Math.round((totalSpent / totalCap) * 100) : 0;

    return {
      items: itemsWithShare,
      totalSpent,
      totalCap,
      overallPercent,
    };
  }, [categories, transactions]);

  // 2. Calculate Debtor / Split Balances (backed by SplitRecord & SplitItem + transaction splits)
  const debtorAnalytics = useMemo(() => {
    const debtors = new Map<
      string,
      { name: string; amount: number; count: number; status: string; txs: string[] }
    >();

    const currentName = currentUser?.name?.toLowerCase().trim() || "";
    const currentEmail = currentUser?.email?.toLowerCase().trim() || "";

    // 2a. Backed by SplitRecord & SplitItem entities
    splits.forEach((split) => {
      split.items?.forEach((item) => {
        const pNameLower = item.participantName.toLowerCase().trim();
        const pEmailLower = (item.participantEmail || "").toLowerCase().trim();

        if (
          pNameLower === "—" ||
          pNameLower.includes("self") ||
          (currentName && pNameLower === currentName) ||
          (currentEmail && pEmailLower === currentEmail)
        ) {
          return;
        }

        const name = item.participantName;
        const isPaid = item.status === "PAID";
        let entry = debtors.get(name);
        if (!entry) {
          entry = {
            name,
            amount: 0,
            count: 0,
            status: isPaid ? "settled" : "pending",
            txs: [],
          };
          debtors.set(name, entry);
        }
        entry.amount += item.amount;
        entry.count += 1;
        entry.txs.push(split.description || "");
        if (!isPaid && entry.status !== "disputed") {
          entry.status = "pending";
        }
      });
    });

    // 2b. Debtor pending transactions (excluding current user / self)
    transactions
      .filter((t) => {
        if (!t.debtor_name) return false;
        const d = t.debtor_name.toLowerCase().trim();
        if (d === "—" || d === "self" || d.includes("self") || d === "unassigned") return false;
        if (currentName && (d === currentName || d.includes(currentName))) return false;
        return Boolean(t.isOutgoingSplit);
      })
      .forEach((t) => {
        const name = t.debtor_name;
        let entry = debtors.get(name);
        if (!entry) {
          entry = {
            name,
            amount: 0,
            count: 0,
            status: t.status,
            txs: [],
          };
          debtors.set(name, entry);
        }
        entry.amount += t.amount;
        entry.count += 1;
        entry.txs.push(t.merchant);
        if (t.status === "disputed") {
          entry.status = "disputed";
        } else if (t.status === "pending" && entry.status !== "disputed") {
          entry.status = "pending";
        }
      });

    const list = Array.from(debtors.values()).sort((a, b) => b.amount - a.amount);
    const totalReceivables = list
      .filter((d) => d.status === "pending" || d.status === "disputed" || d.status === "unresolved")
      .reduce((sum, d) => sum + d.amount, 0);

    return {
      list,
      totalReceivables,
    };
  }, [transactions, splits, currentUser]);

  // SVG Donut calculation
  const donutSlices = useMemo(() => {
    const total = categoryAnalytics.totalSpent || 1;
    let currentAngle = 0;
    const slices = [];

    for (const item of categoryAnalytics.items) {
      if (item.spent <= 0) continue;
      const fraction = item.spent / total;
      const startAngle = currentAngle;
      const angle = fraction * 360;
      currentAngle += angle;

      slices.push({
        id: item.id,
        name: item.name,
        color: item.color,
        spent: item.spent,
        percentage: Math.round(fraction * 100),
        startAngle,
        angle,
      });
    }

    return slices;
  }, [categoryAnalytics]);

  return (
    <div className="h-full w-full flex flex-col bg-transparent rounded-2xl overflow-y-auto p-4 md:p-5 gap-4 relative">
      {/* Prominent Liquid Flow Animation */}
      <div className="absolute top-0 left-0 right-0 z-10 liquid-bar" />

      {/* Top Banner: Budget Health Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-strong)] mt-1 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] shadow-2xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--fg-primary)] flex items-center gap-2">
              Spending Insights
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-text)] border border-[var(--status-success-border)] font-semibold">
                Real-Time
              </span>
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4 text-xs font-mono">
          <div>
            <span className="text-[var(--fg-muted)] block text-[10px]">TOTAL SPENT</span>
            <span className="text-[var(--fg-primary)] font-bold text-sm tabular-nums">
              ${categoryAnalytics.totalSpent.toFixed(2)}
            </span>
          </div>
          <div className="border-l border-[var(--border-subtle)] pl-3 sm:pl-4">
            <span className="text-[var(--fg-muted)] block text-[10px]">TOTAL CAP</span>
            <span className="text-[var(--fg-secondary)] font-semibold text-sm tabular-nums">
              ${categoryAnalytics.totalCap.toFixed(2)}
            </span>
          </div>
          <div className="border-l border-[var(--border-subtle)] pl-3 sm:pl-4">
            <span className="text-[var(--fg-muted)] block text-[10px]">UTILIZATION</span>
            <span
              className={`font-bold text-sm tabular-nums ${
                categoryAnalytics.overallPercent > 100
                  ? "text-[var(--status-danger-text)]"
                  : "text-[var(--status-success-text)]"
              }`}
            >
              {categoryAnalytics.overallPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Grid of 3 Core Visual Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Insight 1: Budget Caps vs Actual Spend (7 Columns) */}
        <div className="lg:col-span-7 bg-[var(--surface-card)] border border-[var(--border-strong)] rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-[var(--accent-text)]" />
                <h3 className="text-xs font-bold text-[var(--fg-primary)] uppercase tracking-wider">
                  Budget Caps vs. Spend
                </h3>
              </div>
              <span className="text-[11px] text-[var(--fg-muted)]">
                {categoryAnalytics.items.filter((i) => i.isOver).length > 0 ? (
                  <span className="text-[var(--status-danger-text)] font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {categoryAnalytics.items.filter((i) => i.isOver).length} exceeded
                  </span>
                ) : (
                  <span className="text-[var(--status-success-text)] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> All caps healthy
                  </span>
                )}
              </span>
            </div>

            {/* List of comparison bars */}
            <div className="flex flex-col gap-3.5">
              {categoryAnalytics.items.map((cat) => {
                const isOver = cat.isOver;
                const barWidth = Math.min(100, cat.percent);

                return (
                  <div key={cat.id} className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center justify-between text-xs gap-x-2 gap-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-semibold text-[var(--fg-primary)]">
                          {cat.name}
                        </span>
                        {isOver && (
                          <span className="text-[10px] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border border-[var(--status-danger-border)] px-1.5 py-0.5 rounded font-semibold shrink-0 tabular-nums">
                            +${cat.diff.toFixed(2)} Over
                          </span>
                        )}
                      </div>

                      <div className="font-mono text-[var(--fg-secondary)] tabular-nums shrink-0 text-[11px] sm:text-xs">
                        <span
                          className={`font-semibold ${
                            isOver ? "text-[var(--status-danger-text)]" : "text-[var(--fg-primary)]"
                          }`}
                        >
                          ${cat.spent.toFixed(2)}
                        </span>
                        <span className="text-[var(--fg-muted)]"> / </span>
                        <span className="text-[var(--fg-secondary)]">${cat.monthlyCap.toFixed(0)}</span>
                        <span className="text-[var(--fg-muted)] text-[11px] ml-1">({cat.percent}%)</span>
                      </div>
                    </div>

                    {/* Comparative Track Bar */}
                    <div className="w-full bg-[var(--surface-subtle)] rounded-full h-2.5 overflow-hidden border border-[var(--border-subtle)]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOver ? "bg-rose-500" : cat.percent > 80 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--fg-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy
              <span className="w-2 h-2 rounded-full bg-amber-500 ml-2" /> &gt;80%
              <span className="w-2 h-2 rounded-full bg-rose-500 ml-2" /> Exceeded
            </span>
            <span className="font-mono text-[var(--fg-muted)]">
              {categoryAnalytics.items.length} Categories
            </span>
          </div>
        </div>

        {/* Insight 2: Category Spending Share Donut (5 Columns) */}
        <div className="lg:col-span-5 bg-[var(--surface-card)] border border-[var(--border-strong)] rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-[var(--accent-text)]" />
                <h3 className="text-xs font-bold text-[var(--fg-primary)] uppercase tracking-wider">
                  Spending Share
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[var(--fg-muted)] tabular-nums">
                ${categoryAnalytics.totalSpent.toFixed(0)}
              </span>
            </div>

            {/* Custom SVG Donut Diagram */}
            <div className="flex items-center justify-center my-2">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {donutSlices.map((slice) => {
                    const strokeDasharray = `${(slice.percentage * 282.7) / 100} 282.7`;
                    const strokeDashoffset = -((slice.startAngle * 282.7) / 360);
                    const isHovered = hoveredSlice === slice.name;

                    return (
                      <circle
                        key={slice.id}
                        cx="50"
                        cy="50"
                        r="45"
                        fill="transparent"
                        stroke={slice.color}
                        strokeWidth={isHovered ? 12 : 9}
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-200 cursor-pointer"
                        onMouseEnter={() => setHoveredSlice(slice.name)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      />
                    );
                  })}
                </svg>

                {/* Donut Center Display */}
                <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-[10px] text-[var(--fg-muted)] uppercase font-semibold">
                    {hoveredSlice || "Total"}
                  </span>
                  <span className="text-sm font-bold text-[var(--fg-primary)] font-mono tabular-nums">
                    {hoveredSlice
                      ? `$${categoryAnalytics.items
                          .find((i) => i.name === hoveredSlice)
                          ?.spent.toFixed(0)}`
                      : `$${categoryAnalytics.totalSpent.toFixed(0)}`}
                  </span>
                  <span className="text-[10px] text-[var(--fg-muted)] font-mono">
                    {hoveredSlice
                      ? `${
                          categoryAnalytics.items.find((i) => i.name === hoveredSlice)
                            ?.shareOfTotal
                        }%`
                      : `${transactions.length} txns`}
                  </span>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3">
              {donutSlices.map((slice) => (
                <div
                  key={slice.id}
                  onMouseEnter={() => setHoveredSlice(slice.name)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                    hoveredSlice === slice.name
                      ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] scale-[1.02]"
                      : "bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-[var(--accent-border)]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="text-[11px] text-[var(--fg-primary)] truncate font-medium">
                      {slice.name}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--fg-muted)] ml-1 shrink-0 tabular-nums">
                    {slice.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Insight 3: Split Balances & Counterparty Receivables (Full 12 Columns) */}
        <div className="lg:col-span-12 bg-[var(--surface-card)] border border-[var(--border-strong)] rounded-2xl p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--accent-text)]" />
              <h3 className="text-xs font-bold text-[var(--fg-primary)] uppercase tracking-wider">
                Split Receivables
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--fg-muted)]">Unsettled:</span>
              <span className="font-bold text-[var(--accent-text)] font-mono text-sm tabular-nums">
                ${debtorAnalytics.totalReceivables.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {debtorAnalytics.list.map((debtor) => {
              const isSettled = debtor.status === "settled";
              const isDisputed = debtor.status === "disputed";

              return (
                <div
                  key={debtor.name}
                  className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] transition-colors flex flex-col justify-between gap-2 shadow-2xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-[var(--fg-primary)] truncate">
                        {debtor.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border shrink-0 ${
                          isSettled
                            ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)] border-[var(--status-success-border)]"
                            : isDisputed
                            ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border-[var(--status-danger-border)]"
                            : "bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-border)]"
                        }`}
                      >
                        {isSettled ? "Settled" : isDisputed ? "Disputed" : "Pending"}
                      </span>
                    </div>

                    <p className="text-base font-bold text-[var(--fg-primary)] font-mono tabular-nums">
                      ${debtor.amount.toFixed(2)}
                    </p>

                    <p className="text-[11px] text-[var(--fg-muted)] truncate mt-0.5">
                      {debtor.txs.join(", ")}
                    </p>
                  </div>

                  {!isSettled && (
                    <button
                      type="button"
                      onClick={() =>
                        onActionClick?.(
                          `Draft a PayPal payment reminder for ${debtor.name} for $${debtor.amount.toFixed(
                            2
                          )}`
                        )
                      }
                      className="mt-1 flex items-center justify-center gap-1 w-full py-1.5 rounded-lg bg-[var(--surface-card)] hover:bg-[var(--accent-subtle)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] text-[var(--accent-text)] text-[11px] font-semibold border border-[var(--accent-border)] transition-all cursor-pointer shadow-2xs"
                    >
                      <span>Draft Reminder</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
