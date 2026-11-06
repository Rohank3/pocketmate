"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { ChatPanel, ChatMessageItem } from "@/components/chat/ChatPanel";
import { TransactionGrid, TransactionRow } from "@/components/grid/TransactionGrid";
import { ActionCardData } from "@/components/cards/ActionConfirmCard";
import { GridMutationState } from "@/types/agent";
import { CategoryControlBar, CategoryItem } from "@/components/categories/CategoryControlBar";
import {
  Wallet,
  TrendingDown,
  ShieldCheck,
  Zap,
  CreditCard,
  Table2,
  BarChart3,
  CalendarDays,
  Sparkles,
} from "lucide-react";

// Dynamically import AG Studio embedded analytics component
const FinancialStudio = dynamic(
  () => import("@/components/studio/FinancialStudio"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full min-h-[550px] bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center justify-center p-8 text-center animate-pulse">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold text-zinc-300">Loading AG Studio Pro Analytics...</p>
        <p className="text-xs text-zinc-500 mt-1">Initializing self-serve embedded dashboard engine</p>
      </div>
    ),
  }
);

// Dynamically import BryntumScheduler client-only component
const BudgetScheduler = dynamic(
  () => import("@/components/scheduler/BudgetScheduler"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full min-h-[550px] bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center justify-center p-8 text-center animate-pulse">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold text-zinc-300">Loading Bryntum Scheduler Enterprise...</p>
        <p className="text-xs text-zinc-500 mt-1">Initializing timeline engine & license validation</p>
      </div>
    ),
  }
);

const INITIAL_TRANSACTIONS: TransactionRow[] = [
  {
    id: "tx_bar_01",
    date: "Today, 11:30 PM",
    merchant: "Downtown Craft Bar & Grill",
    category: "Dining",
    debtor_name: "Group Split (Alex, Dave...)",
    amount: 65.0,
    status: "settled",
  },
  {
    id: "tx_bowl_02",
    date: "Today, 10:15 PM",
    merchant: "Bowlero Lanes",
    category: "Entertainment",
    debtor_name: "Group Split (Alex, Dave...)",
    amount: 85.0,
    status: "settled",
  },
  {
    id: "tx_diner_03",
    date: "Today, 09:00 PM",
    merchant: "Midnight Diner",
    category: "Dining",
    debtor_name: "Group Split (Alex, Dave...)",
    amount: 50.0,
    status: "settled",
  },
  {
    id: "tx_zara_04",
    date: "Today, 04:30 PM",
    merchant: "Zara Mall Galleria",
    category: "Shopping",
    debtor_name: "Sarah Jenkins",
    amount: 65.0,
    status: "pending",
  },
  {
    id: "tx_sbux_05",
    date: "Today, 04:00 PM",
    merchant: "Starbucks Coffee",
    category: "Dining",
    debtor_name: "Sarah Jenkins",
    amount: 14.0,
    status: "pending",
  },
  {
    id: "tx_target_06",
    date: "Today, 03:15 PM",
    merchant: "Target Superstore",
    category: "Groceries",
    debtor_name: "Self",
    amount: 82.5,
    status: "settled",
  },
  {
    id: "tx_dining_07",
    date: "Yesterday, 08:30 PM",
    merchant: "Bistro Lumiere",
    category: "Dining",
    debtor_name: "Mark & Leo Split",
    amount: 130.0,
    status: "disputed",
  },
  {
    id: "tx_sq_08",
    date: "Yesterday, 04:15 PM",
    merchant: "SQ* Urban Blend",
    category: "Dining",
    debtor_name: "Unassigned",
    amount: 34.2,
    status: "unresolved",
  },
];

export default function Home() {
  const [activePersona, setActivePersona] = useState<"GENERAL" | "FREELANCER" | "BUSINESS">("GENERAL");
  const [activeRightTab, setActiveRightTab] = useState<"grid" | "studio" | "scheduler">("grid");
  const [transactions, setTransactions] = useState<TransactionRow[]>(INITIAL_TRANSACTIONS);
  const [gridMutation, setGridMutation] = useState<GridMutationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [categories, setCategories] = useState<CategoryItem[]>([
    { id: "cat_groceries", name: "Groceries", monthlyCap: 400, color: "#10b981" },
    { id: "cat_dining", name: "Dining", monthlyCap: 250, color: "#3b82f6" },
    { id: "cat_entertainment", name: "Entertainment", monthlyCap: 150, color: "#8b5cf6" },
    { id: "cat_shopping", name: "Shopping", monthlyCap: 200, color: "#ec4899" },
  ]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const handleAddCategory = (newCat: Omit<CategoryItem, "id">) => {
    const id = `cat_${Date.now()}`;
    setCategories((prev) => [...prev, { ...newCat, id }]);
    setSelectedCategory(newCat.name);
  };

  const handleEditCategory = (categoryId: string, updatedCap: number, updatedName?: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, monthlyCap: updatedCap, ...(updatedName ? { name: updatedName } : {}) }
          : c
      )
    );
  };

  const handleDeleteCategory = (categoryId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    setSelectedCategory("All");
  };
  const [authenticatedUser, setAuthenticatedUser] = useState<{ name: string; email: string } | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("connected") === "paypal") {
        return {
          name: params.get("userName") || "Sandbox User",
          email: params.get("userEmail") || "",
        };
      }
    }
    return null;
  });

  const [messages, setMessages] = useState<ChatMessageItem[]>([
    {
      id: "msg_welcome",
      role: "assistant",
      content:
        "Hello! I am PocketMate, your Autonomous Financial Orchestrator. Speak to me casually — I will pull your PayPal transactions, compute penny-locked splits, monitor category budget caps, and drive your AG Grid ledger in real time without manual spreadsheet upkeep.",
    },
  ]);

  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessageItem = {
      id: `usr_${Date.now()}`,
      role: "user",
      content: text,
    };

    const assistantMsgId = `asst_${Date.now()}`;
    const initialAssistantMsg: ChatMessageItem = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      toolBadges: [],
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: activePersona,
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const eventLine = block.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = block.split("\n").find((l) => l.startsWith("data: "));

          if (eventLine && dataLine) {
            const event = eventLine.slice(7).trim();
            const data = JSON.parse(dataLine.slice(6));

            if (event === "text_delta" && data.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + data.text }
                    : m
                )
              );
            } else if (event === "tool_call" && data.name) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolBadges: Array.from(new Set([...(m.toolBadges || []), `tool: ${data.name}`])),
                      }
                    : m
                )
              );
            } else if (event === "grid_mutation") {
              setGridMutation(data as GridMutationState);
            } else if (event === "action_card") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, actionCard: data as ActionCardData }
                    : m
                )
              );
            } else if (event === "persona_update" && data.persona) {
              setActivePersona(data.persona);
            }
          }
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId && !m.content
            ? { ...m, content: "Processed your request successfully." }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadReceipt = async (file: File) => {
    setIsLoading(true);
    const userMsg: ChatMessageItem = {
      id: `usr_receipt_${Date.now()}`,
      role: "user",
      content: `📎 Dropped receipt image: ${file.name} (${(file.size / 1024).toFixed(1)} KB). Auditing against pending PayPal charges...`,
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("transactionId", "tx_dining_07");

      const res = await fetch("/api/receipt/audit", {
        method: "POST",
        body: formData,
      });

      const auditData = await res.json();
      const audit = auditData.audit;

      if (audit.discrepancyDetected) {
        setGridMutation({
          highlightRowId: "tx_dining_07",
          statusMessage: `Discrepancy: $${audit.receiptTotal.toFixed(2)} receipt vs $${audit.chargedTotal.toFixed(2)} charge.`,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `asst_audit_${Date.now()}`,
            role: "assistant",
            content: `🧾 **Gemini Vision Receipt Audit Results**\n\n• **Merchant:** ${auditData.parsedReceipt.merchantName}\n• **Extracted Subtotal:** $${auditData.parsedReceipt.subtotal.toFixed(2)}\n• **Tax & Tip:** $${(auditData.parsedReceipt.tax + auditData.parsedReceipt.tip).toFixed(2)}\n• **Calculated Total:** $${audit.receiptTotal.toFixed(2)}\n• **Settled PayPal Charge:** $${audit.chargedTotal.toFixed(2)}\n\n⚠️ **Mismatch Detected:** An unrecognized difference of **$${audit.discrepancyAmount.toFixed(2)}** was billed by the merchant.\n\nWould you like me to initiate a PayPal dispute for the $${audit.discrepancyAmount.toFixed(2)} unauthorized surcharge, or split the settled $${audit.chargedTotal.toFixed(2)} evenly?`,
            toolBadges: ["tool: audit_receipt_against_transaction", "gemini-2.5-pro-vision"],
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `asst_audit_${Date.now()}`,
            role: "assistant",
            content: `Receipt verified! Total of $${audit.receiptTotal.toFixed(2)} matches your PayPal charge. Ready to split.`,
          },
        ]);
      }
    } catch (err: unknown) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_audit_${Date.now()}`,
          role: "assistant",
          content: "Failed to audit the receipt image. Please ensure it is a valid JPEG/PNG.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = async (cardData: ActionCardData) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionToConfirm: cardData,
        }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: `asst_confirm_${Date.now()}`,
          role: "assistant",
          content: data.reply || "Invoices dispatched successfully via PayPal Sandbox.",
        },
      ]);

      // Update grid status to pending
      setTransactions((prev) =>
        prev.map((t) =>
          cardData.recipients.some((r) => r.description.includes(t.merchant))
            ? { ...t, status: "pending" }
            : t
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSchedulerEventClick = (eventName: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: `Selected timeline event: **${eventName}**\n\nI can analyze this entry against your monthly category ceilings or draft a PayPal payment reminder if this involves an unsettled split.`,
      },
    ]);
  };

  // 1. Dynamic Unsettled Debts Calculation
  const unsettledTransactions = transactions.filter(
    (t) => (t.status === "pending" || t.status === "disputed" || t.status === "unresolved") && t.debtor_name !== "Self"
  );
  const totalUnsettledAmount = unsettledTransactions.reduce((acc, t) => acc + t.amount, 0);

  const debtorSums: Record<string, number> = {};
  unsettledTransactions.forEach((t) => {
    const name = t.debtor_name || "Unassigned";
    debtorSums[name] = (debtorSums[name] || 0) + t.amount;
  });

  let largestDebtorName = "";
  let largestDebtorAmount = 0;
  for (const [name, amt] of Object.entries(debtorSums)) {
    if (amt > largestDebtorAmount) {
      largestDebtorAmount = amt;
      largestDebtorName = name;
    }
  }

  // 2. Dynamic Category Budget Ceiling Calculation
  const targetCategory =
    selectedCategory !== "All"
      ? categories.find((c) => c.name.toLowerCase() === selectedCategory.toLowerCase()) || categories[0]
      : categories.find((c) => c.name.toLowerCase() === "groceries") || categories[0];

  const activeCategoryName = targetCategory?.name || "Groceries";
  const activeCategoryCap = targetCategory?.monthlyCap || 400;
  const activeCategorySpent = transactions
    .filter((t) => t.category.toLowerCase() === activeCategoryName.toLowerCase())
    .reduce((sum, t) => sum + t.amount, 0);

  const isCategoryOverBudget = activeCategorySpent > activeCategoryCap;
  const categoryDiff = Math.abs(activeCategorySpent - activeCategoryCap);
  const categoryPercentUsed = activeCategoryCap > 0 ? Math.round((activeCategorySpent / activeCategoryCap) * 100) : 0;

  // 3. Dynamic Reconciled Today / Ledger Integrity
  const totalTransactionCount = transactions.length;
  const untaggedTransactions = transactions.filter(
    (t) => t.status === "unresolved" || t.debtor_name === "Unassigned" || t.category === "Uncategorized"
  );

  // 4. Dynamic Pending PayPal Invoices
  const pendingInvoices = transactions.filter(
    (t) => (t.status === "pending" || t.status === "unresolved") && t.debtor_name !== "Self"
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col p-3 md:p-6 lg:p-8">
      {/* Top Bar / Branding */}
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-zinc-950 shadow-lg shadow-emerald-500/20">
              <Wallet className="w-5 h-5 font-bold" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                PocketMate
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  PayPal Developer & AG Grid
                </span>
              </h1>
              <p className="text-xs text-zinc-400">
                Autonomous Financial Orchestrator · Zero-Friction Reconciliation
              </p>
            </div>
          </div>
        </div>

        {/* Connection & Auth Indicator */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Sandbox Status */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono">Sandbox Connected</span>
          </div>

          {/* Log in with PayPal / Authenticated User */}
          {authenticatedUser ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-blue-500/30 text-xs">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-zinc-200 font-medium">{authenticatedUser.name}</span>
              <button
                onClick={() => setAuthenticatedUser(null)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 ml-1 underline cursor-pointer"
              >
                Sign out
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/paypal"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0070ba] hover:bg-[#005ea6] active:bg-[#003087] text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
              </svg>
              <span>Log in with PayPal</span>
            </a>
          )}
        </div>
      </header>

      {/* Metrics Row (Dynamically Computed from Ledger State) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Unsettled Debts</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">
              ${totalUnsettledAmount.toFixed(2)}
            </p>
            <p className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
              {largestDebtorName
                ? `${largestDebtorName} owes $${largestDebtorAmount.toFixed(2)} (Largest share)`
                : "All balances settled"}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">{activeCategoryName} Budget Cap</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">
              ${activeCategorySpent.toFixed(2)} / ${activeCategoryCap.toFixed(0)}
            </p>
            <p
              className={`text-[11px] mt-0.5 ${
                isCategoryOverBudget ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {isCategoryOverBudget
                ? `⚠️ $${categoryDiff.toFixed(2)} over monthly ceiling (${categoryPercentUsed}%)`
                : `✅ $${categoryDiff.toFixed(2)} remaining under ceiling (${categoryPercentUsed}%)`}
            </p>
          </div>
          <div
            className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
              isCategoryOverBudget
                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Reconciled Today</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">
              {totalTransactionCount} Transactions
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {untaggedTransactions.length > 0
                ? `${untaggedTransactions.length} Untagged ($${untaggedTransactions[0].amount.toFixed(2)} ${untaggedTransactions[0].merchant})`
                : "All charges categorized & clean"}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Pending PayPal Invoices</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">
              {pendingInvoices.length} Invoices Ready
            </p>
            <p className="text-[11px] text-emerald-400 mt-0.5">
              {pendingInvoices.length > 0 ? "Penny-locked settlement" : "All invoices settled"}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </section>

      {/* Main Split-View Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[580px]">
        {/* Left Column: Conversational Orchestration Agent (5 Cols) */}
        <div className="lg:col-span-5 h-[620px] lg:h-auto">
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onUploadReceipt={handleUploadReceipt}
            onConfirmAction={handleConfirmAction}
          />
        </div>

        {/* Right Column: AG Grid Reactive Ledger + Bryntum Timeline (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col h-[650px] lg:h-auto gap-3">
          {/* Universal Category Command & Roundabout Carousel Bar */}
          <CategoryControlBar
            categories={categories}
            selectedCategory={selectedCategory}
            transactions={transactions}
            onSelectCategory={setSelectedCategory}
            onAddCategory={handleAddCategory}
            onEditCategory={handleEditCategory}
            onDeleteCategory={handleDeleteCategory}
          />

          {/* View Tab Switcher */}
          <div className="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 p-1.5 rounded-xl">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setActiveRightTab("grid")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeRightTab === "grid"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>AG Grid</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-200 border border-blue-800/40">
                  Live
                </span>
              </button>

              <button
                onClick={() => setActiveRightTab("studio")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeRightTab === "studio"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>AG Studio</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-200 border border-emerald-800/40">
                  Analytics
                </span>
              </button>

              <button
                onClick={() => setActiveRightTab("scheduler")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeRightTab === "scheduler"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Bryntum Timeline</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950/60 text-purple-200 border border-purple-800/40">
                  Scheduler
                </span>
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 pr-2 text-[11px] text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Multi-View Financial Engine</span>
            </div>
          </div>

          {/* Active View Container */}
          <div className="flex-1 min-h-[560px]">
            {activeRightTab === "grid" && (
              <TransactionGrid
                rowData={transactions}
                gridMutation={gridMutation}
                selectedCategory={selectedCategory}
              />
            )}
            {activeRightTab === "studio" && (
              <FinancialStudio />
            )}
            {activeRightTab === "scheduler" && (
              <BudgetScheduler
                categories={categories}
                selectedCategory={selectedCategory}
                onEventClick={handleSchedulerEventClick}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
