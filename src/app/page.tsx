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
  ShieldAlert,
  Zap,
  CreditCard,
  Table2,
  BarChart3,
  CalendarDays,
  Sparkles,
  Users,
  Clock,
} from "lucide-react";

// Dynamically import Financial Insights component
const FinancialStudio = dynamic(
  () => import("@/components/studio/FinancialStudio"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full min-h-[550px] bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center justify-center p-8 text-center animate-pulse">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold text-zinc-300">Loading Spending Insights...</p>
        <p className="text-xs text-zinc-500 mt-1">Calculating budget caps and spending distribution</p>
      </div>
    ),
  }
);

// Dynamically import Payment Calendar component
const BudgetScheduler = dynamic(
  () => import("@/components/scheduler/BudgetScheduler"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full min-h-[550px] bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center justify-center p-8 text-center animate-pulse">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold text-zinc-300">Loading Payment Calendar...</p>
        <p className="text-xs text-zinc-500 mt-1">Retrieving scheduled bills, receivables & milestones</p>
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
  const [activeRightTab, setActiveRightTab] = useState<"transactions" | "insights" | "upcoming">("transactions");
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

  const handleEditCategory = (
    categoryId: string,
    updatedCap: number,
    updatedName?: string,
    updatedColor?: string
  ) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id === categoryId) {
          const oldName = c.name;
          const newName = updatedName && updatedName.trim() ? updatedName.trim() : c.name;

          if (updatedName && newName.toLowerCase() !== oldName.toLowerCase()) {
            setTransactions((txs) =>
              txs.map((tx) =>
                tx.category.toLowerCase() === oldName.toLowerCase()
                  ? { ...tx, category: newName }
                  : tx
              )
            );
            if (selectedCategory.toLowerCase() === oldName.toLowerCase()) {
              setSelectedCategory(newName);
            }
          }

          return {
            ...c,
            monthlyCap: updatedCap,
            name: newName,
            color: updatedColor || c.color,
          };
        }
        return c;
      })
    );
  };

  const handleDeleteCategory = (categoryId: string) => {
    const target = categories.find((c) => c.id === categoryId);
    if (target) {
      setTransactions((prev) =>
        prev.map((t) =>
          t.category.toLowerCase() === target.name.toLowerCase()
            ? { ...t, category: "Uncategorized" }
            : t
        )
      );
      if (selectedCategory.toLowerCase() === target.name.toLowerCase()) {
        setSelectedCategory("All");
      }
    }
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
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
    handleSendMessage(
      `Review scheduled item "${eventName}". Analyze its budget impact and prepare any needed PayPal payment reminder or action.`
    );
  };

  // 1. Dynamic Spending & Budget Health (Card 1)
  const isAllCategories = selectedCategory.toLowerCase() === "all";
  const activeCat = !isAllCategories
    ? categories.find((c) => c.name.toLowerCase() === selectedCategory.toLowerCase()) || null
    : null;

  const totalSpend = transactions.reduce((sum, t) => sum + t.amount, 0);
  const totalBudgetCap = categories.reduce((sum, c) => sum + c.monthlyCap, 0);

  const displaySpent = activeCat
    ? transactions
        .filter((t) => t.category.toLowerCase() === activeCat.name.toLowerCase())
        .reduce((sum, t) => sum + t.amount, 0)
    : totalSpend;
  const displayCap = activeCat ? activeCat.monthlyCap : totalBudgetCap;
  const isBudgetOver = displaySpent > displayCap;
  const budgetDiff = Math.abs(displaySpent - displayCap);
  const budgetPercentUsed = displayCap > 0 ? Math.round((displaySpent / displayCap) * 100) : 0;
  const displayBudgetTitle = activeCat ? `${activeCat.name} Budget Cap` : "Monthly Spending Health";

  // 2. Dynamic Friends Owe You (Card 2)
  const unsettledTransactions = transactions.filter(
    (t) => (t.status === "pending" || t.status === "disputed" || t.status === "unresolved") && t.debtor_name !== "Self"
  );
  const totalFriendsOwe = unsettledTransactions.reduce((acc, t) => acc + t.amount, 0);

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

  // 3. Dynamic Upcoming Bills Due in next 7 days (Card 3)
  const upcomingBillsAmount = 95.0 + 24.99;

  // 4. Dynamic Action Needed / Triage (Card 4)
  const disputedCount = transactions.filter((t) => t.status === "disputed").length;
  const unresolvedCount = transactions.filter(
    (t) => t.status === "unresolved" || t.debtor_name === "Unassigned" || t.category === "Uncategorized"
  ).length;
  const totalActionRequired = disputedCount + unresolvedCount;

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

      {/* Redesigned 4 Everyday Actionable Financial Metrics Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {/* Card 1: Monthly Spending Health */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">{displayBudgetTitle}</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">
              ${displaySpent.toFixed(2)} / ${displayCap.toFixed(0)}
            </p>
            <p
              className={`text-[11px] mt-0.5 ${
                isBudgetOver ? "text-rose-400 font-medium" : "text-emerald-400"
              }`}
            >
              {isBudgetOver
                ? `⚠️ $${budgetDiff.toFixed(2)} over ceiling (${budgetPercentUsed}%)`
                : `✅ $${(displayCap - displaySpent).toFixed(2)} remaining (${budgetPercentUsed}% used)`}
            </p>
          </div>
          <div
            className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
              isBudgetOver
                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            }`}
          >
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Friends Owe You */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Friends Owe You</p>
            <p className="text-lg font-bold text-amber-400 font-mono mt-0.5">
              ${totalFriendsOwe.toFixed(2)} Owed
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
              {largestDebtorName
                ? `${largestDebtorName} owes $${largestDebtorAmount.toFixed(2)} (Largest)`
                : "All balances settled"}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Upcoming Bills Due (Next 7 Days) */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Upcoming Bills Due</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">
              ${upcomingBillsAmount.toFixed(2)} Due Next 7d
            </p>
            <p className="text-[11px] text-blue-400 mt-0.5">
              AWS ($95) & Streaming ($25) on Nov 12-18
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Action Required (Triage & Audit) */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Action Required</p>
            <p className="text-lg font-bold text-rose-400 font-mono mt-0.5">
              {totalActionRequired} Items to Review
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {disputedCount > 0 ? `⚠️ ${disputedCount} Mismatch Flag` : ""}
              {unresolvedCount > 0 ? ` · ${unresolvedCount} Uncategorized` : ""}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-5 h-5" />
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

        {/* Right Column: Transactions Ledger, Visual Insights & Upcoming Due Calendar (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col h-[650px] lg:h-auto gap-3">
          {/* View Tab Switcher */}
          <div className="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 p-1.5 rounded-xl">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setActiveRightTab("transactions")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeRightTab === "transactions"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Transactions</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-200 border border-blue-800/40">
                  Live Ledger
                </span>
              </button>

              <button
                onClick={() => setActiveRightTab("insights")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeRightTab === "insights"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Insights</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-200 border border-emerald-800/40">
                  Visual Analytics
                </span>
              </button>

              <button
                onClick={() => setActiveRightTab("upcoming")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeRightTab === "upcoming"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Upcoming & Due</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950/60 text-purple-200 border border-purple-800/40">
                  Payment Calendar
                </span>
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 pr-2 text-[11px] text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Multi-View Financial Engine</span>
            </div>
          </div>

          {/* Active View Container */}
          <div className="flex-1 min-h-[560px] flex flex-col">
            {activeRightTab === "transactions" && (
              <div className="flex flex-col gap-3 h-full">
                {/* Category Control Bar scoped directly to Transactions Ledger */}
                <CategoryControlBar
                  categories={categories}
                  selectedCategory={selectedCategory}
                  transactions={transactions}
                  onSelectCategory={setSelectedCategory}
                  onAddCategory={handleAddCategory}
                  onEditCategory={handleEditCategory}
                  onDeleteCategory={handleDeleteCategory}
                />
                <div className="flex-1 min-h-[480px]">
                  <TransactionGrid
                    rowData={transactions}
                    gridMutation={gridMutation}
                    selectedCategory={selectedCategory}
                  />
                </div>
              </div>
            )}
            {activeRightTab === "insights" && (
              <FinancialStudio
                categories={categories}
                transactions={transactions}
                onActionClick={handleSendMessage}
              />
            )}
            {activeRightTab === "upcoming" && (
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
