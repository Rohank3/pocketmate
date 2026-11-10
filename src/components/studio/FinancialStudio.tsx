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
  categories = [
    { id: "cat_groceries", name: "Groceries", monthlyCap: 400, color: "#10b981" },
    { id: "cat_dining", name: "Dining", monthlyCap: 250, color: "#3b82f6" },
    { id: "cat_entertainment", name: "Entertainment", monthlyCap: 150, color: "#8b5cf6" },
    { id: "cat_shopping", name: "Shopping", monthlyCap: 200, color: "#ec4899" },
  ],
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
      if (!tx.category) continue;
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

    const map: Record<string, { spent: number; count: number }> = {};
    for (const c of allCategories) {
      map[c.name.toLowerCase()] = { spent: 0, count: 0 };
    }

    let totalSpent = 0;
    for (const tx of transactions) {
      totalSpent += tx.amount;
      const key = tx.category.toLowerCase();
      const matched = allCategories.find(
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

    const items = allCategories.map((cat) => {
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
        entry.txs.push(split.description || "Shared Split Expense");
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
        return t.isOutgoingSplit || t.splitAllocation === "split" || (!d.includes("self") && d !== "shared split");
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
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-stone-50/90 border border-stone-200/90 mt-1 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-300 flex items-center justify-center text-amber-800 shadow-2xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              Spending Insights & Budget Health
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold">
                Real-Time
              </span>
            </h2>
            <p className="text-xs text-stone-500">
              Clear breakdown of monthly budget caps, spending distribution, and split receivables
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-stone-500 block text-[10px]">TOTAL SPENT</span>
            <span className="text-zinc-900 font-bold text-sm">
              ${categoryAnalytics.totalSpent.toFixed(2)}
            </span>
          </div>
          <div className="border-l border-stone-200 pl-4">
            <span className="text-stone-500 block text-[10px]">TOTAL CAP</span>
            <span className="text-stone-600 font-semibold text-sm">
              ${categoryAnalytics.totalCap.toFixed(2)}
            </span>
          </div>
          <div className="border-l border-stone-200 pl-4">
            <span className="text-stone-500 block text-[10px]">UTILIZATION</span>
            <span
              className={`font-bold text-sm ${
                categoryAnalytics.overallPercent > 100 ? "text-rose-600" : "text-emerald-700"
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
        <div className="lg:col-span-7 bg-white border border-stone-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                  Budget Caps vs. Actual Spend
                </h3>
              </div>
              <span className="text-[11px] text-stone-500">
                {categoryAnalytics.items.filter((i) => i.isOver).length > 0 ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {categoryAnalytics.items.filter((i) => i.isOver).length} cap breached
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> All caps healthy
                  </span>
                )}
              </span>
            </div>

            <p className="text-xs text-stone-500 mb-4">
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
                        <span className="font-semibold text-zinc-800">{cat.name}</span>
                        {isOver && (
                          <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 rounded font-semibold">
                            +${cat.diff.toFixed(2)} Over Cap
                          </span>
                        )}
                      </div>

                      <div className="font-mono text-zinc-700">
                        <span className={`font-semibold ${isOver ? "text-rose-600" : "text-zinc-900"}`}>
                          ${cat.spent.toFixed(2)}
                        </span>
                        <span className="text-stone-400"> / </span>
                        <span className="text-stone-600">${cat.monthlyCap.toFixed(0)}</span>
                        <span className="text-stone-400 text-[11px] ml-1.5">({cat.percent}%)</span>
                      </div>
                    </div>

                    {/* Comparative Track Bar */}
                    <div className="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden border border-stone-200">
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

          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy
              <span className="w-2 h-2 rounded-full bg-amber-500 ml-2" /> &gt;80% Warning
              <span className="w-2 h-2 rounded-full bg-rose-500 ml-2" /> Exceeded
            </span>
            <span className="font-mono text-stone-500">
              {categoryAnalytics.items.length} Tracked Categories
            </span>
          </div>
        </div>

        {/* Insight 2: Category Spending Share Donut (5 Columns) */}
        <div className="lg:col-span-5 bg-white border border-stone-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                  Spending Share
                </h3>
              </div>
              <span className="text-[11px] font-mono text-stone-500">
                100% of ${categoryAnalytics.totalSpent.toFixed(0)}
              </span>
            </div>

            <p className="text-xs text-stone-500 mb-3">
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
                  <span className="text-[10px] text-stone-500 uppercase font-semibold">
                    {hoveredSlice || "Total"}
                  </span>
                  <span className="text-sm font-bold text-zinc-900 font-mono">
                    {hoveredSlice
                      ? `$${categoryAnalytics.items
                          .find((i) => i.name === hoveredSlice)
                          ?.spent.toFixed(0)}`
                      : `$${categoryAnalytics.totalSpent.toFixed(0)}`}
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">
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
                  className={`flex items-center justify-between p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                    hoveredSlice === slice.name
                      ? "bg-amber-50/70 border-amber-300 scale-[1.02]"
                      : "bg-stone-50 border-stone-200 hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="text-xs text-zinc-800 truncate font-medium">{slice.name}</span>
                  </div>
                  <span className="text-xs font-mono text-stone-500 ml-1">
                    {slice.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Insight 3: Split Balances & Counterparty Receivables (Full 12 Columns) */}
        <div className="lg:col-span-12 bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-700" />
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                Split Balances & Receivables
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-500">Total Unsettled Owed:</span>
              <span className="font-bold text-amber-900 font-mono text-sm">
                ${debtorAnalytics.totalReceivables.toFixed(2)}
              </span>
            </div>
          </div>

          <p className="text-xs text-stone-500 mb-3.5">
            Active group splits and individual debts linked to your PayPal ledger charges.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {debtorAnalytics.list.map((debtor) => {
              const isSettled = debtor.status === "settled";
              const isDisputed = debtor.status === "disputed";

              return (
                <div
                  key={debtor.name}
                  className="p-3 rounded-xl bg-stone-50/80 border border-stone-200 hover:border-amber-300 transition-colors flex flex-col justify-between gap-2 shadow-2xs"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-zinc-900 truncate max-w-[130px]">
                        {debtor.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                          isSettled
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : isDisputed
                            ? "bg-rose-50 text-rose-700 border-rose-300"
                            : "bg-amber-50 text-amber-900 border-amber-300"
                        }`}
                      >
                        {isSettled ? "Settled" : isDisputed ? "Discrepancy" : "Pending"}
                      </span>
                    </div>

                    <p className="text-base font-bold text-zinc-900 font-mono">
                      ${debtor.amount.toFixed(2)}
                    </p>

                    <p className="text-[11px] text-stone-500 truncate mt-0.5">
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
                      className="mt-1 flex items-center justify-center gap-1 w-full py-1.5 rounded-lg bg-white hover:bg-amber-50 text-amber-900 text-[11px] font-semibold border border-amber-300 transition-colors cursor-pointer shadow-2xs"
                    >
                      <span>Draft Reminder</span>
                      <ArrowUpRight className="w-3 h-3 text-amber-700" />
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
