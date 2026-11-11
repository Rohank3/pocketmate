"use client";

import React, { useState, useRef, useEffect, useMemo, useSyncExternalStore } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
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
  RotateCcw,
  X,
} from "lucide-react";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";
import type { TransactionRow } from "@/components/grid/TransactionGrid";
import type { ScheduledEvent } from "@/components/scheduler/BudgetScheduler";
import type { UserAccount } from "@/types/sandboxUser";
import { ensureUniqueCategoryColors } from "@/lib/utils/categoryColors";
import { computeCategorySpending } from "@/lib/utils/budgetMetrics";
import { InvoiceReminderModal, PendingInvoiceItem } from "@/components/modals/InvoiceReminderModal";
import { useTheme } from "@/components/theme/ThemeContext";

gsap.registerPlugin(useGSAP);

export interface FunctionalMetricsRowProps {
  categories: CategoryItem[];
  transactions: TransactionRow[];
  events: ScheduledEvent[];
  currentUser: UserAccount | null;
  splits?: Array<{
    id: string;
    description: string;
    itemsJson?: unknown;
    items?: Array<{
      id?: string;
      participantName: string;
      participantEmail?: string;
      amount: number;
      status: string;
      paypalInvoiceId?: string;
    }>;
  }>;
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
  invoices: PendingInvoiceItem[];
}

export interface SettledSplitSummary {
  id: string;
  splitRecordId: string;
  name: string;
  email: string;
  amountPaid: number;
  originalAmount: number;
  difference: number;
  isAdjusted: boolean;
  status: "PAID" | "CANCELLED";
  reason?: string;
  sampleMerchant: string;
  invoiceId?: string;
}

interface ActionQueueItem {
  id: string;
  type: "dispute" | "uncategorized" | "debtor" | "budget_breach" | "debt_owed" | "bill_due";
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
  splits = [],
  activeScope,
  onNavigateTab,
  onFilterLedger,
  onSendChatMessage,
  onOpenReviewModal,
}) => {
  const { isDark } = useTheme();
  const [activeFlyout, setActiveFlyout] = useState<number | null>(null);
  const [pinnedFlyout, setPinnedFlyout] = useState<number | null>(null);
  const [reminderModalDebtor, setReminderModalDebtor] = useState<DebtorSummary | null>(null);
  const [reminderToast, setReminderToast] = useState<string | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = containerRef.current?.querySelectorAll(".kpi-reveal");
        if (!cards?.length) return;
        gsap.fromTo(
          cards,
          { y: 12, opacity: 0.45 },
          {
            y: 0,
            opacity: 1,
            duration: 0.46,
            stagger: 0.055,
            ease: "power3.out",
            clearProps: "transform,opacity",
          }
        );
      });
      return () => mm.revert();
    },
    { scope: containerRef }
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const flyouts = containerRef.current?.querySelectorAll(".kpi-flyout-reveal");
        if (!flyouts?.length) return;
        gsap.fromTo(
          flyouts,
          { y: -8, scale: 0.98, opacity: 0 },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.24,
            ease: "power3.out",
            clearProps: "transform,opacity",
          }
        );
      });
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [activeFlyout, pinnedFlyout], revertOnUpdate: true }
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
  const {
    totalSpent,
    totalCommittedSubscriptions,
    totalBudgetCap,
    isBudgetOver,
    budgetPercentUsed,
    remainingBudget,
    spentBarWidth,
    committedBarWidth,
    categoryBars,
  } = useMemo(() => {
      const normalizedCats = ensureUniqueCategoryColors(categories);
      const spendingSummary = computeCategorySpending(normalizedCats, transactions);

      const bars = normalizedCats.map((cat) => {
        const normKey = cat.name.toLowerCase();
        const catSpent = spendingSummary.byCategory[normKey]?.spent || 0;

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

      const netTotalSpent = spendingSummary.totalSpent;

      const cap = categories.reduce((sum, c) => sum + (c.monthlyCap || 0), 0);
      const over = netTotalSpent > cap;
      const percent = cap > 0 ? Math.round((netTotalSpent / cap) * 100) : 0;
      const remaining = Math.max(0, cap - netTotalSpent);

      // Calculate upcoming committed subscriptions for the current month (client-only to prevent prerender hydration mismatch)
      let totalCommitted = 0;
      if (isClient) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const todayDay = now.getDate();

        const committedSubscriptions = (events || []).filter((e) => {
          if (e.type !== "outgoing" || e.status === "completed") return false;
          const titleLower = e.title.toLowerCase();
          if (
            titleLower.includes("alert") ||
            titleLower.includes("soft cap") ||
            titleLower.includes("threshold")
          ) {
            return false;
          }
          const dayOfMonth = e.dayOfMonth || (e.date ? parseInt(e.date.slice(8, 10)) : 15);
          if (dayOfMonth > todayDay) return true;
          if (e.date) {
            const d = new Date(e.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
          }
          return true;
        });

        totalCommitted = committedSubscriptions.reduce((sum, s) => sum + s.amount, 0);
      }

      const spentBarWidth = cap > 0 ? Math.min(100, Math.round((netTotalSpent / cap) * 100)) : 0;
      const committedBarWidth =
        cap > 0 ? Math.min(100 - spentBarWidth, Math.round((totalCommitted / cap) * 100)) : 0;

      return {
        totalSpent: netTotalSpent,
        totalCommittedSubscriptions: totalCommitted,
        totalBudgetCap: cap,
        isBudgetOver: over,
        budgetPercentUsed: percent,
        remainingBudget: remaining,
        spentBarWidth,
        committedBarWidth,
        categoryBars: bars,
      };
    }, [transactions, categories, events, isClient]);

  // ==========================================
  // 2. CARD 2: FRIENDS OWE YOU (Backed by SplitRecord / SplitItem & Transaction Splits)
  // ==========================================
  const { debtorList, settledList, totalFriendsOwe, totalPendingCount } = useMemo(() => {
    const currentName = currentUser?.name?.toLowerCase().trim() || "";
    const currentEmail = currentUser?.email?.toLowerCase().trim() || "";

    const map = new Map<string, DebtorSummary>();
    const settledList: SettledSplitSummary[] = [];
    const seenInvoiceIds = new Set<string>();

    // 1. Incorporate SplitRecord & SplitItem entities
    splits.forEach((split) => {
      const rawItems = Array.isArray(split.itemsJson)
        ? (split.itemsJson as Array<Record<string, unknown>>)
        : [];

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

        if (item.paypalInvoiceId) {
          seenInvoiceIds.add(item.paypalInvoiceId);
        }

        // If item is PAID or CANCELLED, collect it into settledList
        if (item.status === "PAID" || item.status === "CANCELLED") {
          const meta = rawItems.find(
            (m) =>
              (m.participantEmail &&
                pEmailLower &&
                (m.participantEmail as string).toLowerCase().trim() === pEmailLower) ||
              (m.participantName &&
                (m.participantName as string).toLowerCase().trim() === pNameLower)
          );

          const amountPaid = typeof meta?.amountPaid === "number" ? meta.amountPaid : item.amount;
          const originalAmount =
            typeof meta?.originalAmount === "number" ? meta.originalAmount : item.amount;
          const difference =
            typeof meta?.difference === "number"
              ? meta.difference
              : Math.max(0, originalAmount - amountPaid);
          const isAdjusted = meta?.isAdjusted === true || difference > 0.01;
          const reason =
            typeof meta?.settledReason === "string" ? meta.settledReason : undefined;

          settledList.push({
            id: item.id || `${split.id}-${item.participantName}`,
            splitRecordId: split.id,
            name: item.participantName,
            email: item.participantEmail || "",
            amountPaid,
            originalAmount,
            difference,
            isAdjusted,
            status: item.status as "PAID" | "CANCELLED",
            reason,
            sampleMerchant: split.description || "",
            invoiceId:
              item.paypalInvoiceId ||
              (typeof meta?.invoiceId === "string" ? meta.invoiceId : undefined),
          });
          return;
        }

        const name = item.participantName;
        const invDetail: PendingInvoiceItem = {
          id: item.paypalInvoiceId || item.id || `inv_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          amount: item.amount,
          memo: split.description || "",
        };

        const existing = map.get(name);
        if (existing) {
          existing.totalOwed += item.amount;
          existing.count += 1;
          existing.invoices.push(invDetail);
        } else {
          map.set(name, {
            name,
            totalOwed: item.amount,
            count: 1,
            sampleMerchant: split.description || "",
            invoices: [invDetail],
          });
        }
      });
    });

    // 2. Incorporate live PayPal API transactions & invoices
    transactions.forEach((t) => {
      // Avoid double-counting if already ingested via split item
      if (seenInvoiceIds.has(t.id)) return;

      const d = (t.debtor_name || "").toLowerCase().trim();
      if (!d || d === "—" || d === "self" || d.includes("self") || d === "unassigned") return;
      if (currentName && (d === currentName || d.includes(currentName))) return;

      const isPendingSplit =
        (t.status === "pending" || t.status === "disputed" || t.status === "unresolved") &&
        t.isOutgoingSplit === true;

      if (isPendingSplit) {
        const name = t.debtor_name || "Counterparty";
        const invDetail: PendingInvoiceItem = {
          id: t.id,
          amount: t.amount,
          memo: t.memo || t.merchant || "",
          date: t.date,
        };

        const existing = map.get(name);
        if (existing) {
          existing.totalOwed += t.amount;
          existing.count += 1;
          existing.invoices.push(invDetail);
        } else {
          map.set(name, {
            name,
            totalOwed: t.amount,
            count: 1,
            sampleMerchant: t.memo || t.merchant || "",
            invoices: [invDetail],
          });
        }
      } else if (
        (t.status === "settled" || (t.status as string) === "COMPLETED") &&
        t.isOutgoingSplit === true
      ) {
        // Collect settled invoices from live PayPal API
        settledList.push({
          id: t.id,
          splitRecordId: t.id,
          name: t.debtor_name || "Counterparty",
          email: "",
          amountPaid: t.amount,
          originalAmount: t.amount,
          difference: 0,
          isAdjusted: false,
          status: "PAID",
          sampleMerchant: t.memo || t.merchant || "",
          invoiceId: t.id,
        });
      }
    });

    const list = Array.from(map.values()).sort((a, b) => b.totalOwed - a.totalOwed);
    const sum = list.reduce((acc, d) => acc + d.totalOwed, 0);
    const count = list.reduce((acc, d) => acc + d.count, 0);

    return { debtorList: list, settledList, totalFriendsOwe: sum, totalPendingCount: count };
  }, [transactions, splits, currentUser]);

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
      const titleLower = e.title.toLowerCase();
      // Defensive filter: Ignore budget threshold alert records
      if (
        titleLower.includes("alert") ||
        titleLower.includes("soft cap") ||
        titleLower.includes("threshold")
      ) {
        return false;
      }
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

    // All valid outgoing scheduled events represent legitimate recurring bills or subscriptions
    outgoingEvents.forEach((ev) => {
      subs.push(ev);
    });

    // Personal debts strictly come from transactions / split invoices where currentUser is debtor
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
    if (!isClient) return [];

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
      const rawInvoiceId = urgentDebt.id.startsWith("tx_owed_")
        ? urgentDebt.id.slice(8)
        : "";
      queue.push({
        id: `debt_urgent_${urgentDebt.id}`,
        type: "debt_owed",
        title: `Pending Debt: ${urgentDebt.counterparty || urgentDebt.title}`,
        description: `$${urgentDebt.amount.toFixed(2)} due to ${urgentDebt.counterparty || "peer"}.`,
        amount: urgentDebt.amount,
        severity: "high",
        prompt: `PocketMate, please initiate payment review for the pending debt of $${urgentDebt.amount.toFixed(2)} to ${urgentDebt.counterparty || urgentDebt.title}${rawInvoiceId ? ` (Invoice ID: ${rawInvoiceId})` : ""}.`,
        buttonLabel: "Settle via PayPal",
      });
    }

    // F. Upcoming bills due in the next 48 hours
    const now = new Date();
    const todayDay = now.getDate();
    const billsDueSoon = events.filter((e) => {
      if (e.type !== "outgoing" || e.status === "completed") return false;
      const titleLower = e.title.toLowerCase();
      if (
        titleLower.includes("alert") ||
        titleLower.includes("soft cap") ||
        titleLower.includes("threshold")
      ) {
        return false;
      }
      const day = e.dayOfMonth || (e.date ? parseInt(e.date.slice(8, 10)) : 15);
      const diff = day - todayDay;
      return diff >= 0 && diff <= 2;
    });

    billsDueSoon.forEach((b) => {
      queue.push({
        id: `bill_due_${b.id}`,
        type: "bill_due",
        title: `Bill Due in 48h: ${b.title}`,
        description: `$${b.amount.toFixed(2)} due on ${b.date || `day ${b.dayOfMonth}`}.`,
        amount: b.amount,
        severity: "high",
        prompt: `PocketMate, review upcoming bill "${b.title}" for $${b.amount.toFixed(2)} due soon.`,
        buttonLabel: "Review Bill",
      });
    });

    return queue;
  }, [transactions, categoryBars, personalDebtBills, events, isClient]);

  const isAnyFlyoutOpen = activeFlyout !== null || pinnedFlyout !== null;

  return (
    <div ref={containerRef} className={`relative mb-6 ${isAnyFlyoutOpen ? "z-30" : "z-10"}`}>
      {/* 4 Responsive Actionable Glass Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* ========================================================= */}
        {/* CARD 1: Monthly Budget                                    */}
        {/* ========================================================= */}
        <div
          onMouseEnter={() => handleMouseEnter(1)}
          onMouseLeave={handleMouseLeave}
          className={`relative kpi-reveal ${isFlyoutOpen(1) ? "z-25" : ""}`}
        >
          <div
            onClick={() => handleCardClick(1)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCardClick(1);
              }
            }}
            className={`relative h-full p-4 rounded-2xl cursor-pointer select-none glass-panel-interactive ${
              isFlyoutOpen(1) ? "glass-card-active" : ""
            }`}
            role="button"
            tabIndex={0}
            aria-expanded={isFlyoutOpen(1)}
          >
            <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-[var(--fg-muted)] tracking-wider uppercase">
                  Monthly Budget
                </span>
              </div>
              <p className="text-xl font-bold text-[var(--fg-primary)] font-mono tabular-nums mt-1 tracking-tight truncate">
                ${totalSpent.toFixed(2)}{" "}
                <span className="text-[var(--fg-muted)] text-xs font-normal">/ ${totalBudgetCap.toFixed(0)}</span>
              </p>
              {totalCommittedSubscriptions > 0 && (
                <p className="text-[10px] text-[var(--accent-text)] font-medium truncate mt-0.5">
                  +${totalCommittedSubscriptions.toFixed(2)} committed
                </p>
              )}
              <div className="mt-1.5 flex items-center">
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border truncate ${
                    isBudgetOver
                      ? "text-[var(--status-danger-text)] bg-[var(--status-danger-bg)] border-[var(--status-danger-border)]"
                      : "text-[var(--status-success-text)] bg-[var(--status-success-bg)] border-[var(--status-success-border)]"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isBudgetOver ? "bg-rose-500" : "bg-emerald-500"}`}
                  />
                  {isBudgetOver
                    ? `$${Math.max(0, totalSpent - totalBudgetCap).toFixed(2)} over (${budgetPercentUsed}%)`
                    : `$${remainingBudget.toFixed(2)} left (${budgetPercentUsed}%)`}
                </span>
              </div>
            </div>
            <div
              className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-transform ${
                isBudgetOver
                  ? "bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-[var(--status-danger-text)]"
                  : "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]"
              }`}
            >
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          </div>

          {/* Glass Dropdown Flyout for Card 1 */}
          {isFlyoutOpen(1) && (
            <div
              onMouseEnter={() => handleMouseEnter(1)}
              onMouseLeave={handleMouseLeave}
              className="absolute left-0 top-[calc(100%+10px)] w-[calc(100vw-28px)] sm:w-[400px] p-5 rounded-2xl glass-dropdown kpi-flyout-reveal z-40 text-[var(--fg-primary)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Flyout Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[var(--status-info-bg)] border border-[var(--status-info-border)] flex items-center justify-center text-[var(--status-info-text)]">
                    <BarChart3 className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-[var(--fg-primary)] tracking-wider uppercase">
                    Budget Breakdown
                  </span>
                </div>
                <span className="text-[11px] font-mono tabular-nums font-semibold px-2.5 py-0.5 rounded-full bg-[var(--surface-subtle)] text-[var(--fg-secondary)] border border-[var(--border-subtle)]">
                  {budgetPercentUsed}% Used
                </span>
              </div>

              {/* Overall Progress Bar */}
              <div className="mt-4 mb-4">
                <div className="flex justify-between text-xs mb-1.5 font-mono tabular-nums">
                  <span className="text-[var(--fg-muted)]">Spent</span>
                  <span className="text-[var(--fg-primary)] font-bold">
                    ${totalSpent.toFixed(2)} / ${totalBudgetCap.toFixed(2)}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-[var(--surface-subtle)] rounded-full overflow-hidden p-0.5 border border-[var(--border-subtle)] flex">
                  <div
                    title={`Settled Spent: $${totalSpent.toFixed(2)}`}
                    className={`h-full transition-all duration-500 ${committedBarWidth > 0 ? "rounded-l-full" : "rounded-full"} ${
                      isBudgetOver
                        ? "bg-rose-500"
                        : budgetPercentUsed > 80
                        ? "bg-sky-500"
                        : "bg-gradient-to-r from-[#0070ba] to-sky-400"
                    }`}
                    style={{ width: `${spentBarWidth}%` }}
                  />
                  {committedBarWidth > 0 && (
                    <div
                      title={`Committed: $${totalCommittedSubscriptions.toFixed(2)}`}
                      className="h-full transition-all duration-500 border-l border-white/40 rounded-r-full bg-[repeating-linear-gradient(45deg,#38bdf8,#38bdf8_2px,rgba(0,112,186,0.25)_2px,rgba(0,112,186,0.25)_5px)]"
                      style={{ width: `${committedBarWidth}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--fg-muted)]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#0070ba]" /> Settled (${totalSpent.toFixed(2)})
                  </span>
                  {totalCommittedSubscriptions > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded border border-sky-400/60 bg-sky-400/30" /> Committed (${totalCommittedSubscriptions.toFixed(2)})
                    </span>
                  )}
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-[var(--fg-muted)] tracking-wider uppercase">
                  Categories
                </p>
                <span className="text-[10px] text-[var(--fg-muted)] font-medium">{categoryBars.length} active</span>
              </div>

              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                {categoryBars.map((cat) => (
                  <div
                    key={cat.id}
                    className="p-2.5 rounded-xl glass-subitem flex flex-col gap-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-semibold text-[var(--fg-primary)] truncate">{cat.name}</span>
                        {cat.isOver && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border border-[var(--status-danger-border)] font-semibold">
                            Over
                          </span>
                        )}
                      </div>
                      <span className="font-mono tabular-nums text-[var(--fg-secondary)] text-[11px] shrink-0 font-medium">
                        ${cat.spent.toFixed(0)} / ${cat.monthlyCap}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--surface-subtle)] rounded-full overflow-hidden">
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
              <div className="mt-4 pt-3.5 border-t border-[var(--border-subtle)] flex items-center justify-end">
                <button
                  onClick={() => {
                    onNavigateTab("insights");
                    setActiveFlyout(null);
                    setPinnedFlyout(null);
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--status-info-text)] hover:brightness-110 px-3 py-1.5 rounded-lg bg-[var(--status-info-bg)] border border-[var(--status-info-border)] transition-all cursor-pointer"
                >
                  <span>Open Insights</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* CARD 2: Pending Settlements                               */}
        {/* ========================================================= */}
        <div
          onMouseEnter={() => handleMouseEnter(2)}
          onMouseLeave={handleMouseLeave}
          className={`relative kpi-reveal ${isFlyoutOpen(2) ? "z-25" : ""}`}
        >
          <div
            onClick={() => handleCardClick(2)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCardClick(2);
              }
            }}
            className={`relative h-full p-4 rounded-2xl cursor-pointer select-none glass-panel-interactive ${
              isFlyoutOpen(2) ? "glass-card-active" : ""
            }`}
            role="button"
            tabIndex={0}
            aria-expanded={isFlyoutOpen(2)}
          >
            <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-[11px] font-bold text-[var(--fg-muted)] tracking-wider uppercase">
                Pending Settlements
              </p>
              <p className="text-xl font-bold text-[var(--accent-text)] font-mono tabular-nums mt-1 tracking-tight truncate">
                ${totalFriendsOwe.toFixed(2)}{" "}
                <span className="text-[var(--fg-muted)] text-xs font-normal">Owed</span>
              </p>
              <div className="mt-1.5 flex items-center">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-[var(--status-info-bg)] text-[var(--status-info-text)] border border-[var(--status-info-border)] truncate">
                  <span className={`w-1.5 h-1.5 rounded-full ${isDark ? "bg-sky-400" : "bg-[#0070ba]"}`} />
                  {debtorList.length > 0
                    ? `${debtorList.length} friend${debtorList.length > 1 ? "s" : ""} · ${totalPendingCount} pending`
                    : settledList.length > 0
                    ? `${settledList.length} settled`
                    : "All settled"}
                </span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[var(--status-info-bg)] border border-[var(--status-info-border)] flex items-center justify-center text-[var(--status-info-text)] shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </div>
          </div>

          {/* Glass Dropdown Flyout for Card 2 */}
          {isFlyoutOpen(2) && (
            <div
              onMouseEnter={() => handleMouseEnter(2)}
              onMouseLeave={handleMouseLeave}
              className="absolute left-0 sm:left-auto sm:right-0 lg:right-auto lg:left-0 top-[calc(100%+10px)] w-[calc(100vw-28px)] sm:w-[400px] p-5 rounded-2xl glass-dropdown kpi-flyout-reveal z-40 text-[var(--fg-primary)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[var(--status-info-bg)] border border-[var(--status-info-border)] flex items-center justify-center text-[var(--status-info-text)]">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-[var(--fg-primary)] tracking-wider uppercase">
                    Pending Settlements
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-[var(--status-info-text)] px-2.5 py-0.5 rounded-full bg-[var(--status-info-bg)] border border-[var(--status-info-border)]">
                  ${totalFriendsOwe.toFixed(2)} Total
                </span>
              </div>

              {/* Debtor List */}
              <div className="mt-3.5 flex flex-col gap-2.5 max-h-72 overflow-y-auto pr-1">
                {debtorList.length === 0 && settledList.length === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-[var(--status-success-text)] mx-auto mb-2 opacity-85" />
                    <p className="text-xs font-bold text-[var(--fg-primary)]">All Balances Settled</p>
                    <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                      No pending balances.
                    </p>
                  </div>
                ) : (
                  <>
                    {debtorList.map((debtor) => (
                      <div
                        key={debtor.name}
                        className="p-3 rounded-xl glass-subitem flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-xs shrink-0">
                            {debtor.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[var(--fg-primary)] truncate">{debtor.name}</p>
                            <p className="text-[10px] text-[var(--fg-muted)] truncate">
                              {debtor.count} pending · {debtor.sampleMerchant}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold font-mono tabular-nums text-[var(--accent-text)]">
                            ${debtor.totalOwed.toFixed(2)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {/* Filter Ledger */}
                            <button
                              title="Filter ledger"
                              onClick={() => {
                                onFilterLedger(debtor.name);
                                onNavigateTab("transactions");
                                setActiveFlyout(null);
                                setPinnedFlyout(null);
                              }}
                              className="p-1.5 rounded-lg theme-btn-secondary border transition-colors cursor-pointer"
                            >
                              <Filter className="w-3 h-3" />
                            </button>
                            {/* Send Reminder via PayPal Invoicing API */}
                            <button
                              title={`Remind ${debtor.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setReminderModalDebtor(debtor);
                                setActiveFlyout(null);
                                setPinnedFlyout(null);
                              }}
                              className="p-1.5 rounded-lg bg-[var(--status-info-bg)] hover:bg-[var(--accent-subtle-hover)] active:scale-95 text-[var(--status-info-text)] border border-[var(--status-info-border)] transition-all cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Recently Settled Section */}
                    {settledList.length > 0 && (
                      <div className="mt-2 pt-2.5 border-t border-[var(--border-subtle)]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-[var(--fg-muted)] uppercase tracking-wider">
                            Recently Settled
                          </span>
                          <span className="text-[10px] font-mono text-[var(--status-success-text)] font-semibold">
                            {settledList.length} records
                          </span>
                        </div>
                        <div className="flex flex-col gap-2">
                          {settledList.map((item) => (
                            <div
                              key={item.id}
                              className="p-2.5 rounded-xl glass-subitem flex flex-col gap-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-text)] border border-[var(--status-success-border)] flex items-center justify-center font-bold text-[10px] shrink-0">
                                    {item.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-xs font-bold text-[var(--fg-primary)] truncate">{item.name}</p>
                                      <span
                                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-semibold border ${
                                          item.status === "CANCELLED"
                                            ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border-[var(--status-danger-border)]"
                                            : item.isAdjusted
                                            ? "bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-border)]"
                                            : "bg-[var(--status-success-bg)] text-[var(--status-success-text)] border-[var(--status-success-border)]"
                                        }`}
                                      >
                                        {item.status === "CANCELLED"
                                          ? "Declined"
                                          : item.isAdjusted
                                          ? "Adjusted"
                                          : "Settled"}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-[var(--fg-muted)] truncate">{item.sampleMerchant}</p>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-xs font-bold font-mono tabular-nums text-[var(--status-success-text)]">
                                    +${item.amountPaid.toFixed(2)}
                                  </span>
                                  {item.isAdjusted && (
                                    <p className="text-[9px] font-mono text-[var(--fg-muted)] line-through">
                                      ${item.originalAmount.toFixed(2)}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {item.reason && (
                                <div className="px-2 py-1 rounded bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[10px] text-[var(--fg-secondary)] italic">
                                  &ldquo;{item.reason}&rdquo;
                                </div>
                              )}

                              {(item.isAdjusted || item.status === "CANCELLED") && (
                                <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--border-subtle)] justify-end">
                                  <button
                                    onClick={() => {
                                      onSendChatMessage(
                                        `PocketMate, accept the adjusted payment from ${item.name} for ${item.sampleMerchant}`
                                      );
                                      setActiveFlyout(null);
                                      setPinnedFlyout(null);
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold theme-btn-secondary border transition-colors cursor-pointer"
                                  >
                                    Accept
                                  </button>
                                  {item.difference > 0 && (
                                    <button
                                      onClick={() => {
                                        onSendChatMessage(
                                          `PocketMate, please request the remaining $${item.difference.toFixed(
                                            2
                                          )} from ${item.name} for ${item.sampleMerchant}`
                                        );
                                        setActiveFlyout(null);
                                        setPinnedFlyout(null);
                                      }}
                                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-[var(--status-info-bg)] hover:bg-[var(--accent-subtle-hover)] text-[var(--status-info-text)] border border-[var(--status-info-border)] transition-colors cursor-pointer"
                                    >
                                      Request ${item.difference.toFixed(2)}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      onSendChatMessage(
                                        `PocketMate, please reinvoke and rebalance the split for ${item.sampleMerchant}`
                                      );
                                      setActiveFlyout(null);
                                      setPinnedFlyout(null);
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold theme-btn-secondary border flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" />
                                    Rebalance
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* CARD 3: Upcoming Bills                                    */}
        {/* ========================================================= */}
        <div
          onMouseEnter={() => handleMouseEnter(3)}
          onMouseLeave={handleMouseLeave}
          className={`relative kpi-reveal ${isFlyoutOpen(3) ? "z-25" : ""}`}
        >
          <div
            onClick={() => handleCardClick(3)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCardClick(3);
              }
            }}
            className={`relative h-full p-4 rounded-2xl cursor-pointer select-none glass-panel-interactive ${
              isFlyoutOpen(3) ? "glass-card-active" : ""
            }`}
            role="button"
            tabIndex={0}
            aria-expanded={isFlyoutOpen(3)}
          >
            <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-[11px] font-bold text-[var(--fg-muted)] tracking-wider uppercase">
                Upcoming Bills
              </p>
              <p className="text-xl font-bold text-[var(--accent-text)] font-mono tabular-nums mt-1 tracking-tight truncate">
                ${totalMonthlyDue.toFixed(2)}{" "}
                <span className="text-[var(--fg-muted)] text-xs font-normal">Due</span>
              </p>
              {/* Dual Summary Badges */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--status-info-bg)] text-[var(--status-info-text)] border border-[var(--status-info-border)] font-mono font-semibold truncate">
                  Subs: ${totalSubscriptionsAmount.toFixed(0)}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)] border border-[var(--status-neutral-border)] font-mono truncate">
                  Owed: ${totalPersonalDebtsAmount.toFixed(0)}
                </span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[var(--status-info-bg)] border border-[var(--status-info-border)] flex items-center justify-center text-[var(--status-info-text)] shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          </div>

          {/* Glass Dropdown Flyout for Card 3 */}
          {isFlyoutOpen(3) && (
            <div
              onMouseEnter={() => handleMouseEnter(3)}
              onMouseLeave={handleMouseLeave}
              className="absolute right-0 sm:right-auto lg:right-auto top-[calc(100%+10px)] w-[calc(100vw-28px)] sm:w-[400px] p-5 rounded-2xl glass-dropdown kpi-flyout-reveal z-40 text-[var(--fg-primary)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[var(--status-info-bg)] border border-[var(--status-info-border)] flex items-center justify-center text-[var(--status-info-text)]">
                    <CalendarDays className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-[var(--fg-primary)] tracking-wider uppercase">
                    Scheduled Payments
                  </span>
                </div>
                <button
                  onClick={() => {
                    onNavigateTab("upcoming");
                    setActiveFlyout(null);
                    setPinnedFlyout(null);
                  }}
                  className="text-[11px] font-semibold text-[var(--status-info-text)] hover:brightness-110 px-2.5 py-1 rounded-lg bg-[var(--status-info-bg)] border border-[var(--status-info-border)] flex items-center gap-1 transition-all cursor-pointer"
                >
                  <span>Calendar</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="mt-3.5 flex flex-col gap-3.5 max-h-64 overflow-y-auto pr-1">
                {/* Recurring Subscriptions */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold text-[var(--accent-text)] flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" />
                      Subscriptions
                    </span>
                    <span className="font-mono tabular-nums text-[var(--fg-secondary)] font-semibold">
                      ${totalSubscriptionsAmount.toFixed(2)}
                    </span>
                  </div>
                  {subscriptionBills.length === 0 ? (
                    <p className="text-[11px] text-[var(--fg-muted)] p-2.5 glass-subitem rounded-xl">
                      None due this month.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {subscriptionBills.map((sub) => (
                        <div
                          key={sub.id}
                          className="p-2.5 rounded-xl glass-subitem flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--fg-primary)] truncate">{sub.title}</p>
                            <p className="text-[10px] text-[var(--fg-muted)]">
                              Due: {sub.date || `Day ${sub.dayOfMonth}`} · {sub.category}
                            </p>
                          </div>
                          <span className="font-mono tabular-nums font-bold text-[var(--fg-primary)] shrink-0">
                            ${sub.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Personal Debts */}
                <div className="pt-2.5 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold text-[var(--fg-secondary)] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Owed to Peers
                    </span>
                    <span className="font-mono tabular-nums text-[var(--fg-secondary)] font-semibold">
                      ${totalPersonalDebtsAmount.toFixed(2)}
                    </span>
                  </div>
                  {personalDebtBills.length === 0 ? (
                    <p className="text-[11px] text-[var(--fg-muted)] p-2.5 glass-subitem rounded-xl">
                      None owed.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {personalDebtBills.map((debt) => (
                        <div
                          key={debt.id}
                          className="p-2.5 rounded-xl glass-subitem flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--fg-primary)] truncate">{debt.title}</p>
                            <p className="text-[10px] text-[var(--fg-muted)]">
                              To: {debt.counterparty || "Peer"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono tabular-nums font-bold text-[var(--fg-primary)]">
                              ${debt.amount.toFixed(2)}
                            </span>
                            <button
                              onClick={() => {
                                const rawInvoiceId = debt.id.startsWith("tx_owed_")
                                  ? debt.id.slice(8)
                                  : "";
                                onSendChatMessage(
                                  `PocketMate, please help settle my pending payment of $${debt.amount.toFixed(2)} for ${debt.title}${rawInvoiceId ? ` (Invoice ID: ${rawInvoiceId})` : ""}.`
                                );
                                setActiveFlyout(null);
                                setPinnedFlyout(null);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[var(--status-info-bg)] text-[var(--status-info-text)] hover:bg-[var(--accent-subtle-hover)] border border-[var(--status-info-border)] text-[10px] font-semibold transition-colors cursor-pointer"
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
        {/* CARD 4: Action Required                                   */}
        {/* ========================================================= */}
        <div
          onMouseEnter={() => handleMouseEnter(4)}
          onMouseLeave={handleMouseLeave}
          className={`relative kpi-reveal ${isFlyoutOpen(4) ? "z-25" : ""}`}
        >
          <div
            onClick={() => handleCardClick(4)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCardClick(4);
              }
            }}
            className={`relative h-full p-4 rounded-2xl cursor-pointer select-none glass-panel-interactive ${
              isFlyoutOpen(4)
                ? actionItems.length > 0
                  ? "glass-card-active glass-card-danger"
                  : "glass-card-active"
                : ""
            }`}
            role="button"
            tabIndex={0}
            aria-expanded={isFlyoutOpen(4)}
          >
            <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-[11px] font-bold text-[var(--fg-muted)] tracking-wider uppercase">
                Action Required
              </p>
              <p
                className={`text-xl font-bold font-mono tabular-nums mt-1 tracking-tight truncate ${
                  actionItems.length > 0 ? "text-[var(--status-danger-text)]" : "text-[var(--status-success-text)]"
                }`}
              >
                {actionItems.length} {actionItems.length === 1 ? "Item" : "Items"}
              </p>
              <div className="mt-1.5 flex items-center">
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border truncate ${
                    actionItems.length > 0
                      ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border-[var(--status-danger-border)]"
                      : "bg-[var(--status-success-bg)] text-[var(--status-success-text)] border-[var(--status-success-border)]"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${actionItems.length > 0 ? "bg-rose-500" : "bg-emerald-500"}`}
                  />
                  {actionItems.length > 0 ? "Needs Review" : "All Clear"}
                </span>
              </div>
            </div>
            <div
              className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                actionItems.length > 0
                  ? "bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-[var(--status-danger-text)]"
                  : "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]"
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          </div>

          {/* Glass Dropdown Flyout for Card 4 */}
          {isFlyoutOpen(4) && (
            <div
              onMouseEnter={() => handleMouseEnter(4)}
              onMouseLeave={handleMouseLeave}
              className="absolute right-0 top-[calc(100%+10px)] w-[calc(100vw-28px)] sm:w-[400px] p-5 rounded-2xl glass-dropdown kpi-flyout-reveal z-40 text-[var(--fg-primary)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] flex items-center justify-center text-[var(--status-danger-text)]">
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-[var(--fg-primary)] tracking-wider uppercase">
                    Action Required ({actionItems.length})
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
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] hover:brightness-110 font-bold border border-[var(--status-danger-border)] transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Triage All</span>
                  </button>
                )}
              </div>

              {/* Action Items List */}
              <div className="mt-3.5 flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
                {actionItems.length === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-[var(--status-success-text)] mx-auto mb-2 opacity-85" />
                    <p className="text-xs font-bold text-[var(--fg-primary)]">All Clear</p>
                    <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                      Nothing needs review.
                    </p>
                  </div>
                ) : (
                  actionItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl glass-subitem flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className={`text-[9px] px-2 py-0.2 rounded-full font-bold uppercase border ${
                                item.severity === "high"
                                  ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border-[var(--status-danger-border)]"
                                  : "bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-border)]"
                              }`}
                            >
                              {item.type.replace("_", " ")}
                            </span>
                            <span className="text-xs font-bold text-[var(--fg-primary)] truncate">
                              {item.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--fg-secondary)]">{item.description}</p>
                        </div>
                        {item.amount && (
                          <span className="text-xs font-mono tabular-nums font-bold text-[var(--status-danger-text)] shrink-0">
                            ${item.amount.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Interactive Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-[var(--border-subtle)]">
                        {item.type === "uncategorized" && onOpenReviewModal && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenReviewModal();
                              setActiveFlyout(null);
                              setPinnedFlyout(null);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg theme-btn-secondary border text-xs font-semibold transition-all cursor-pointer"
                            title="Open review popup"
                          >
                            <Tag className="w-3 h-3 text-[var(--accent-text)]" />
                            <span>Review in Popup ↗</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onSendChatMessage(item.prompt);
                            setActiveFlyout(null);
                            setPinnedFlyout(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--status-info-bg)] hover:bg-[var(--accent-subtle-hover)] text-[var(--status-info-text)] border border-[var(--status-info-border)] text-xs font-semibold transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{item.buttonLabel}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* PayPal Reminder Toast Notification */}
      {reminderToast && (
        <div className="fixed bottom-6 right-6 z-[300] bg-[var(--surface-modal)] text-[var(--fg-primary)] border border-[var(--status-success-border)] rounded-xl px-4 py-2.5 shadow-xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-[var(--status-success-text)] shrink-0" />
          <span className="text-xs font-medium">{reminderToast}</span>
          <button
            type="button"
            onClick={() => setReminderToast(null)}
            className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors cursor-pointer"
            aria-label="Dismiss toast"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Invoice Reminder Modal */}
      {reminderModalDebtor && (
        <InvoiceReminderModal
          isOpen={Boolean(reminderModalDebtor)}
          debtorName={reminderModalDebtor.name}
          invoices={reminderModalDebtor.invoices}
          onClose={() => setReminderModalDebtor(null)}
          onSuccess={(msg) => {
            setReminderToast(msg);
            setTimeout(() => setReminderToast(null), 4000);
          }}
        />
      )}
    </div>
  );
};
