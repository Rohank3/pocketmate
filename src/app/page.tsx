"use client";

import React, { useState } from "react";
import { ChatPanel, ChatMessageItem } from "@/components/chat/ChatPanel";
import { TransactionGrid, TransactionRow } from "@/components/grid/TransactionGrid";
import { ActionCardData } from "@/components/cards/ActionConfirmCard";
import { GridMutationState, ToolExecutionRecord } from "@/types/agent";
import {
  Wallet,
  TrendingDown,
  ShieldCheck,
  Zap,
  Users,
  CreditCard,
  Building2,
  Briefcase,
} from "lucide-react";

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
  const [transactions, setTransactions] = useState<TransactionRow[]>(INITIAL_TRANSACTIONS);
  const [gridMutation, setGridMutation] = useState<GridMutationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/agent", {
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

      const data = await res.json();

      if (data.activePersona && data.activePersona !== activePersona) {
        setActivePersona(data.activePersona);
      }

      if (data.gridMutation) {
        setGridMutation(data.gridMutation);
      }

      const toolBadges = (data.executedTools || []).map((t: ToolExecutionRecord) => `tool: ${t.name}`);

      const assistantMsg: ChatMessageItem = {
        id: `asst_${Date.now()}`,
        role: "assistant",
        content: data.reply || "Done.",
        actionCard: data.actionCard || undefined,
        toolBadges: toolBadges.length > 0 ? toolBadges : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: "Encountered an issue communicating with the agent runtime. Please retry.",
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

        {/* Operating Mode Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
            <span className="text-zinc-400">Mode:</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              {activePersona === "GENERAL" && <Users className="w-3.5 h-3.5" />}
              {activePersona === "FREELANCER" && <Briefcase className="w-3.5 h-3.5" />}
              {activePersona === "BUSINESS" && <Building2 className="w-3.5 h-3.5" />}
              {activePersona}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono">Sandbox Connected</span>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Unsettled Debts</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">$145.00</p>
            <p className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
              Dave owes $65.00 (Largest share)
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Groceries Budget Cap</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">$422.50 / $400</p>
            <p className="text-[11px] text-rose-400 mt-0.5">
              ⚠️ $22.50 over monthly ceiling (106%)
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Reconciled Today</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">6 Transactions</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">1 Untagged ($34.20 Urban Blend)</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Pending PayPal Invoices</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">4 Invoices Ready</p>
            <p className="text-[11px] text-emerald-400 mt-0.5">Penny-locked settlement</p>
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
            activePersona={activePersona}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onConfirmAction={handleConfirmAction}
            onSelectPersona={setActivePersona}
          />
        </div>

        {/* Right Column: AG Grid Reactive Analytical Ledger (7 Cols) */}
        <div className="lg:col-span-7 h-[620px] lg:h-auto">
          <TransactionGrid
            rowData={transactions}
            gridMutation={gridMutation}
          />
        </div>
      </div>
    </main>
  );
}
