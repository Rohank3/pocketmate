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

export interface FinancialStudioProps {
  categories?: CategoryItem[];
  transactions?: TransactionRow[];
  onActionClick?: (message: string) => void;
}

export default function FinancialStudio({
  categories = [
    { id: "cat_groceries", name: "Groceries", monthlyCap: 400, color: "#10b981" },
    { id: "cat_dining", name: "Dining", monthlyCap: 250, color: "#3b82f6" },
    { id: "cat_entertainment", name: "Entertainment", monthlyCap: 150, color: "#8b5cf6" },
    { id: "cat_shopping", name: "Shopping", monthlyCap: 200, color: "#ec4899" },
  ],
  transactions = [],
  onActionClick,
}: FinancialStudioProps) {
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  // 1. Calculate spending per category
  const categoryAnalytics = useMemo(() => {
    const map: Record<string, { spent: number; count: number }> = {};
    for (const c of categories) {
      map[c.name.toLowerCase()] = { spent: 0, count: 0 };
    }

    let totalSpent = 0;
    for (const tx of transactions) {
      totalSpent += tx.amount;
      const key = tx.category.toLowerCase();
      const matched = categories.find(
        (c) =>
          c.name.toLowerCase() === key ||
          c.name.toLowerCase().includes(key) ||
          key.includes(c.name.toLowerCase())
      );
      if (matched) {
        const mKey = matched.name.toLowerCase();
        if (!map[mKey]) map[mKey] = { spent: 0, count: 0 };
        map[mKey].spent += tx.amount;
        map[mKey].count += 1;
      }
    }

    const items = categories.map((cat) => {
      const stat = map[cat.name.toLowerCase()] || { spent: 0, count: 0 };
      const isOver = stat.spent > cat.monthlyCap;
      const diff = Math.abs(stat.spent - cat.monthlyCap);
      const percent = cat.monthlyCap > 0 ? Math.round((stat.spent / cat.monthlyCap) * 100) : 0;
      const shareOfTotal = totalSpent > 0 ? Math.round((stat.spent / totalSpent) * 100) : 0;

      return {
        ...cat,
        spent: stat.spent,
        txCount: stat.count,
        isOver,
        diff,
        percent,
        shareOfTotal,
      };
    });

    const totalCap = categories.reduce((sum, c) => sum + c.monthlyCap, 0);
    const overallPercent = totalCap > 0 ? Math.round((totalSpent / totalCap) * 100) : 0;

    return {
      items,
      totalSpent,
      totalCap,
      overallPercent,
    };
  }, [categories, transactions]);

  // 2. Calculate Debtor / Split Balances
  const debtorAnalytics = useMemo(() => {
    const debtors = new Map<
      string,
      { name: string; amount: number; count: number; status: string; txs: string[] }
    >();

    transactions
      .filter((t) => {
        if (!t.debtor_name) return false;
        const d = t.debtor_name.toLowerCase().trim();
        if (d === "—" || d === "self" || d.includes("self") || d === "unassigned") return false;
        return t.splitAllocation === "split" || (!d.includes("self") && d !== "shared split");
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
  }, [transactions]);

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
    <div className="h-full w-full flex flex-col bg-zinc-950 rounded-xl border border-zinc-800 overflow-y-auto p-4 md:p-5 gap-4">
      {/* Top Banner: Budget Health Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-900 border border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              Spending Insights & Budget Health
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Real-Time
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Clear breakdown of monthly budget caps, spending distribution, and split receivables
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-zinc-500 block text-[10px]">TOTAL SPENT</span>
            <span className="text-zinc-100 font-bold text-sm">
              ${categoryAnalytics.totalSpent.toFixed(2)}
            </span>
          </div>
          <div className="border-l border-zinc-800 pl-4">
            <span className="text-zinc-500 block text-[10px]">TOTAL CAP</span>
            <span className="text-zinc-400 font-semibold text-sm">
              ${categoryAnalytics.totalCap.toFixed(2)}
            </span>
          </div>
          <div className="border-l border-zinc-800 pl-4">
            <span className="text-zinc-500 block text-[10px]">UTILIZATION</span>
            <span
              className={`font-bold text-sm ${
                categoryAnalytics.overallPercent > 100 ? "text-rose-400" : "text-emerald-400"
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
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                  Budget Caps vs. Actual Spend
                </h3>
              </div>
              <span className="text-[11px] text-zinc-400">
                {categoryAnalytics.items.filter((i) => i.isOver).length > 0 ? (
                  <span className="text-rose-400 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {categoryAnalytics.items.filter((i) => i.isOver).length} cap breached
                  </span>
                ) : (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> All caps healthy
                  </span>
                )}
              </span>
            </div>

            <p className="text-xs text-zinc-400 mb-4">
              Monthly spending ceilings compared to current transactions. Bars turn red when a ceiling is breached.
            </p>

            {/* List of comparison bars */}
            <div className="flex flex-col gap-3.5">
              {categoryAnalytics.items.map((cat) => {
                const isOver = cat.isOver;
                const barWidth = Math.min(100, cat.percent);

                return (
                  <div key={cat.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-semibold text-zinc-200">{cat.name}</span>
                        {isOver && (
                          <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded font-semibold">
                            +${cat.diff.toFixed(2)} Over Cap
                          </span>
                        )}
                      </div>

                      <div className="font-mono text-zinc-300">
                        <span className={`font-semibold ${isOver ? "text-rose-400" : "text-zinc-100"}`}>
                          ${cat.spent.toFixed(2)}
                        </span>
                        <span className="text-zinc-500"> / </span>
                        <span className="text-zinc-400">${cat.monthlyCap.toFixed(0)}</span>
                        <span className="text-zinc-500 text-[11px] ml-1.5">({cat.percent}%)</span>
                      </div>
                    </div>

                    {/* Comparative Track Bar */}
                    <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOver ? "bg-rose-500" : cat.percent > 80 ? "bg-amber-400" : "bg-emerald-400"
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Healthy
              <span className="w-2 h-2 rounded-full bg-amber-400 ml-2" /> &gt;80% Warning
              <span className="w-2 h-2 rounded-full bg-rose-500 ml-2" /> Exceeded
            </span>
            <span className="font-mono text-zinc-500">
              {categoryAnalytics.items.length} Tracked Categories
            </span>
          </div>
        </div>

        {/* Insight 2: Category Spending Share Donut (5 Columns) */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                  Spending Share
                </h3>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                100% of ${categoryAnalytics.totalSpent.toFixed(0)}
              </span>
            </div>

            <p className="text-xs text-zinc-400 mb-3">
              Proportion of total monthly expenses distributed across each spending category.
            </p>

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
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                    {hoveredSlice || "Total"}
                  </span>
                  <span className="text-sm font-bold text-zinc-100 font-mono">
                    {hoveredSlice
                      ? `$${categoryAnalytics.items
                          .find((i) => i.name === hoveredSlice)
                          ?.spent.toFixed(0)}`
                      : `$${categoryAnalytics.totalSpent.toFixed(0)}`}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {hoveredSlice
                      ? `${
                          categoryAnalytics.items.find((i) => i.name === hoveredSlice)
                            ?.shareOfTotal
                        }% share`
                      : `${transactions.length} charges`}
                  </span>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {donutSlices.map((slice) => (
                <div
                  key={slice.id}
                  onMouseEnter={() => setHoveredSlice(slice.name)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  className={`flex items-center justify-between p-1.5 rounded-lg border transition-all cursor-pointer ${
                    hoveredSlice === slice.name
                      ? "bg-zinc-800 border-zinc-600 scale-[1.02]"
                      : "bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="text-xs text-zinc-200 truncate">{slice.name}</span>
                  </div>
                  <span className="text-xs font-mono text-zinc-400 ml-1">
                    {slice.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Insight 3: Split Balances & Counterparty Receivables (Full 12 Columns) */}
        <div className="lg:col-span-12 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                Split Balances & Receivables
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">Total Unsettled Owed:</span>
              <span className="font-bold text-amber-400 font-mono">
                ${debtorAnalytics.totalReceivables.toFixed(2)}
              </span>
            </div>
          </div>

          <p className="text-xs text-zinc-400 mb-3.5">
            Active group splits and individual debts linked to your PayPal ledger charges.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {debtorAnalytics.list.map((debtor) => {
              const isSettled = debtor.status === "settled";
              const isDisputed = debtor.status === "disputed";

              return (
                <div
                  key={debtor.name}
                  className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-zinc-200 truncate max-w-[130px]">
                        {debtor.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                          isSettled
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : isDisputed
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}
                      >
                        {isSettled ? "Settled" : isDisputed ? "Discrepancy" : "Pending"}
                      </span>
                    </div>

                    <p className="text-base font-bold text-zinc-100 font-mono">
                      ${debtor.amount.toFixed(2)}
                    </p>

                    <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                      {debtor.txs.join(", ")}
                    </p>
                  </div>

                  {!isSettled && (
                    <button
                      onClick={() =>
                        onActionClick?.(
                          `Draft a PayPal payment reminder for ${debtor.name} for $${debtor.amount.toFixed(
                            2
                          )}`
                        )
                      }
                      className="mt-1 flex items-center justify-center gap-1 w-full py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-[11px] font-medium border border-zinc-800 transition-colors cursor-pointer"
                    >
                      <span>Draft Reminder</span>
                      <ArrowUpRight className="w-3 h-3 text-zinc-400" />
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
