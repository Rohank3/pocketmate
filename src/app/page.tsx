"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { ChatPanel, ChatMessageItem } from "@/components/chat/ChatPanel";
import { TransactionGrid, TransactionRow } from "@/components/grid/TransactionGrid";
import { ActionCardData } from "@/components/cards/ActionConfirmCard";
import { GridMutationState } from "@/types/agent";
import { CategoryControlBar, CategoryItem } from "@/components/categories/CategoryControlBar";
import { PayPalLoginModal } from "@/components/auth/PayPalLoginModal";
import { InvoiceActionModal } from "@/components/cards/InvoiceActionModal";
import { SandboxStore } from "@/lib/sandbox/sandboxStore";
import { UserAccount, InvoiceRecord } from "@/types/sandboxUser";
import { ScheduledEvent } from "@/components/scheduler/BudgetScheduler";
import {
  Wallet,
  CreditCard,
  CalendarDays,
  Sparkles,
  Users,
  Clock,
  DollarSign,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Table2,
  BarChart3,
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

export default function Home() {
  const [activePersona, setActivePersona] = useState<"GENERAL" | "FREELANCER" | "BUSINESS">("GENERAL");
  const [activeRightTab, setActiveRightTab] = useState<"transactions" | "insights" | "upcoming">("transactions");
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isSeedingTransactions, setIsSeedingTransactions] = useState(false);
  const [gridMutation, setGridMutation] = useState<GridMutationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Autonomous Chat Messages State
  const [messages, setMessages] = useState<ChatMessageItem[]>([
    {
      id: "msg_welcome",
      role: "assistant",
      content:
        "Hello! I am PocketMate, your Autonomous Financial Orchestrator. Speak to me casually — I will pull your PayPal transactions, compute penny-locked splits, monitor category budget caps, and drive your AG Grid ledger in real time without manual spreadsheet upkeep.",
    },
  ]);

  // Multi-user sandbox authentication & cross-account sync state
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [activeScope, setActiveScope] = useState<"personal" | "all">("personal");
  const [totalPlatformCount, setTotalPlatformCount] = useState<number>(0);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [activeInvoiceForAction, setActiveInvoiceForAction] = useState<InvoiceRecord | null>(null);
  const [, setInvoices] = useState<InvoiceRecord[]>([]);

  // Dynamic Categories & Scheduled Events state
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [events, setEvents] = useState<ScheduledEvent[]>([]);

  // Load live transactions from PayPal Sandbox (role & user-aware)
  const loadTransactions = useCallback(async (scopeOverride?: "personal" | "all") => {
    setIsLoadingTransactions(true);
    const scopeToUse = scopeOverride || activeScope;
    try {
      const res = await fetch(`/api/paypal/transactions?scope=${scopeToUse}`);
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
        if (typeof data.totalPlatformCount === "number") {
          setTotalPlatformCount(data.totalPlatformCount);
        }
        if (data.activeScope) {
          setActiveScope(data.activeScope);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [activeScope]);

  // 1-Click orchestrate realistic PayPal Sandbox transactions & invoices
  const handleSeedSandboxTransactions = async () => {
    setIsSeedingTransactions(true);
    try {
      const res = await fetch("/api/paypal/seed", { method: "POST" });
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
        await loadTransactions(activeScope);
        setMessages((prev) => [
          ...prev,
          {
            id: `asst_sync_${Date.now()}`,
            role: "assistant",
            content:
              "⚡ **Live PayPal Transactions Synchronized!**\n\n• Queried live records directly from **PayPal Reporting API** (`/v1/reporting/transactions`).\n• Synced authentic invoices via **PayPal Invoicing API** (`/v2/invoicing/invoices`).\n• AG Grid ledger updated with live bilateral transaction history directly from PayPal Developer servers.",
            toolBadges: ["rail: paypal_reporting_api", "rail: paypal_invoicing_v2", "status: LIVE_SANDBOX"],
          },
        ]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSeedingTransactions(false);
    }
  };

  // Load categories from database
  const loadCategories = useCallback(async () => {
    try {
      const catRes = await fetch("/api/categories");
      const catData = await catRes.json();
      if (catData.categories) {
        setCategories(
          catData.categories.map((c: { id: string; name: string; monthlyCap: number; color?: string }) => ({
            id: c.id,
            name: c.name,
            monthlyCap: c.monthlyCap,
            color: c.color || "#3b82f6",
          }))
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // Load scheduled bills & events from database
  const loadEvents = useCallback(async () => {
    try {
      const evRes = await fetch("/api/events");
      const evData = await evRes.json();
      if (evData.events) {
        setEvents(evData.events);
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial load effect
  useEffect(() => {
    let isSubscribed = true;

    const init = async () => {
      try {
        const userRes = await fetch("/api/auth/me");
        const userData = await userRes.json();
        if (isSubscribed && userData.user) {
          setCurrentUser(userData.user);
        }
      } catch {
        // ignore
      }

      try {
        const txRes = await fetch("/api/paypal/transactions");
        const txData = await txRes.json();
        if (isSubscribed && txData.transactions) {
          setTransactions(txData.transactions);
          if (typeof txData.totalPlatformCount === "number") {
            setTotalPlatformCount(txData.totalPlatformCount);
          }
          if (txData.activeScope) {
            setActiveScope(txData.activeScope);
          }
        }
      } catch {
        // ignore
      } finally {
        if (isSubscribed) setIsLoadingTransactions(false);
      }

      await loadCategories();
      await loadEvents();

      if (isSubscribed) {
        setInvoices(SandboxStore.getInvoices());
      }

      // Check if redirected from PayPal OAuth callback
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("connected") === "paypal") {
          const rawUserName = params.get("userName") || "PayPal User";
          const rawUserEmail = params.get("userEmail") || "Sandbox Account";
          const userName = rawUserName.replace(/[<>[\]()]/g, "").slice(0, 50);
          const userEmail = rawUserEmail.replace(/[<>[\]()]/g, "").slice(0, 80);
          if (isSubscribed) {
            setMessages((prev) => [
              ...prev,
              {
                id: `asst_connected_${Date.now()}`,
                role: "assistant",
                content: `🎉 **Successfully Connected to PayPal Sandbox!**\n\n• **Account:** ${userName} (\`${userEmail}\`)\n• **Environment:** Sandbox (Zero real currency risk)\n• **Ledger:** Synchronized with PayPal Developer REST API.`,
                toolBadges: ["oauth: openid_connect", "status: AUTHENTICATED"],
              },
            ]);
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    };

    void init();

    // Revalidate live transactions on window focus (e.g. user returns from PayPal payment/invoice tab)
    const onFocus = () => {
      void loadTransactions();
    };
    window.addEventListener("focus", onFocus);

    // Periodic background sync every 25 seconds when browser tab is active
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadTransactions();
      }
    }, 25000);

    return () => {
      isSubscribed = false;
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [loadCategories, loadEvents, loadTransactions]);

  const handleUserLogin = (user: UserAccount) => {
    setCurrentUser(user);
    setActiveScope("personal");
    void loadTransactions("personal");
    void loadCategories();
    void loadEvents();

    setMessages((prev) => [
      ...prev,
      {
        id: `asst_welcome_user_${Date.now()}`,
        role: "assistant",
        content: `👋 **Welcome, ${user.name}!** Signed in with PayPal Sandbox (\`${user.email}\`). Your live ledger, categories, and calendar are active.`,
      },
    ]);
  };

  const handleUserLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    SandboxStore.setCurrentUser(null);
    setCurrentUser(null);
    setActiveScope("all");
    void loadTransactions("all");
    setMessages((prev) => [
      ...prev,
      {
        id: `asst_logout_${Date.now()}`,
        role: "assistant",
        content:
          "You have signed out of PayPal Sandbox. Click **Log in with PayPal** to reconnect with any Sandbox buyer or merchant account.",
      },
    ]);
  };

  const handleAddCategory = async (newCat: Omit<CategoryItem, "id">) => {
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCat),
      });
      const data = await res.json();
      if (data.category) {
        setCategories((prev) => [...prev, data.category]);
        setSelectedCategory(data.category.name);
        return;
      }
    } catch {
      // fallback
    }
    const id = `cat_${Date.now()}`;
    setCategories((prev) => [...prev, { ...newCat, id }]);
    setSelectedCategory(newCat.name);
  };

  const handleEditCategory = async (
    categoryId: string,
    updatedCap: number,
    updatedName?: string,
    updatedColor?: string
  ) => {
    try {
      await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: categoryId, monthlyCap: updatedCap, name: updatedName, color: updatedColor }),
      });
    } catch {
      // fallback
    }

    setCategories((prev) =>
      prev.map((c) => {
        if (c.id === categoryId) {
          const oldName = c.name;
          const newName = updatedName && updatedName.trim() ? updatedName.trim() : c.name;

          if (updatedName && newName.toLowerCase() !== oldName.toLowerCase()) {
            setTransactions((txs) =>
              txs.map((tx) =>
                tx.category.toLowerCase() === oldName.toLowerCase() ? { ...tx, category: newName } : tx
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

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await fetch(`/api/categories?id=${categoryId}`, { method: "DELETE" });
    } catch {
      // fallback
    }

    const target = categories.find((c) => c.id === categoryId);
    if (target) {
      setTransactions((prev) =>
        prev.map((t) =>
          t.category.toLowerCase() === target.name.toLowerCase() ? { ...t, category: "Uncategorized" } : t
        )
      );
      if (selectedCategory.toLowerCase() === target.name.toLowerCase()) {
        setSelectedCategory("All");
      }
    }
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
  };

  const handleAddScheduledEvent = async (event: Omit<ScheduledEvent, "id">) => {
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      const data = await res.json();
      if (data.event) {
        setEvents((prev) => [...prev, data.event]);
        return;
      }
    } catch {
      // fallback
    }
    setEvents((prev) => [...prev, { ...event, id: `evt_${Date.now()}` }]);
  };

  const handlePayInvoice = (invoiceId: string) => {
    const paid = SandboxStore.settleInvoice(invoiceId);
    if (paid) {
      setInvoices(SandboxStore.getInvoices());
      setMessages((prev) => [
        ...prev,
        {
          id: `asst_paid_${Date.now()}`,
          role: "assistant",
          content: `✅ **PayPal Sandbox Payment Confirmed!**\n\n• **Invoice:** ${paid.paypalInvoiceId}\n• **Amount:** $${paid.amount.toFixed(2)} USD\n• **Recipient:** ${paid.senderName} (${paid.senderEmail})\n• **Status:** Paid & Settled\n\nYour ledger has been updated and the sender has been notified.`,
          toolBadges: ["tool: paypal_sandbox_capture", "status: SETTLED"],
        },
      ]);
    }
  };

  const handleDeclineInvoice = (invoiceId: string, reason: string) => {
    const declined = SandboxStore.declineInvoice(invoiceId, reason);
    if (declined) {
      setInvoices(SandboxStore.getInvoices());
      setMessages((prev) => [
        ...prev,
        {
          id: `asst_dec_${Date.now()}`,
          role: "assistant",
          content: `❌ **Invoice Declined:** ${declined.paypalInvoiceId}\n\n• **Reason:** "${reason}"\n• **Action:** Obligation cancelled for your account. Sender (${declined.senderName}) has been notified.`,
        },
      ]);
    }
  };

  const handleAdjustmentRequest = (invoiceId: string, amount: number, reason: string) => {
    const adjusted = SandboxStore.requestAdjustment(invoiceId, amount, reason);
    if (adjusted) {
      setInvoices(SandboxStore.getInvoices());
      setMessages((prev) => [
        ...prev,
        {
          id: `asst_adj_${Date.now()}`,
          role: "assistant",
          content: `📝 **Adjustment Request Sent:** ${adjusted.paypalInvoiceId}\n\n• **Proposed Amount:** $${amount.toFixed(2)}\n• **Reason:** "${reason}"\n• **Status:** Awaiting review from ${adjusted.senderName}.`,
        },
      ]);
    }
  };

  const handleSendMessage = useCallback(async (text: string) => {
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
          messages: [...messages, userMsg]
            .filter((m) => m.content && m.content.trim().length > 0)
            .map((m) => ({
              role: m.role,
              content: m.content.trim(),
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
            ? { ...m, content: "I reviewed your request, but encountered a temporary connection issue. Please try again." }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [activePersona, messages]);

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
      const targetTx =
        transactions.find((t) => t.status === "pending" || t.status === "unresolved" || t.status === "disputed") ||
        transactions[0];
      if (targetTx?.id) {
        formData.append("transactionId", targetTx.id);
      }

      const res = await fetch("/api/receipt/audit", {
        method: "POST",
        body: formData,
      });

      const auditData = await res.json();
      const audit = auditData.audit;

      if (audit.discrepancyDetected) {
        setGridMutation({
          highlightRowId: targetTx?.id || auditData.transaction?.id,
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

      // Register invoices in SandboxStore for cross-account synchronization
      if (cardData.recipients && cardData.recipients.length > 0) {
        cardData.recipients.forEach((r) => {
          SandboxStore.createInvoice({
            senderId: currentUser?.id || `usr_${Date.now()}`,
            senderName: currentUser?.name || "PocketMate Host",
            senderEmail: currentUser?.email || "host@paypal.sandbox",
            recipientId: `usr_${r.email.replace(/[^a-z0-9]/gi, "_")}`,
            recipientName: r.name || "Recipient",
            recipientEmail: r.email,
            amount: r.amount,
            currency: "USD",
            description: r.description || "Shared Expense Split",
          });
        });
        setInvoices(SandboxStore.getInvoices());
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `asst_confirm_${Date.now()}`,
          role: "assistant",
          content: data.reply || (cardData.action === "DISPATCH_PAYOUT" ? "Payout executed successfully via PayPal Sandbox." : "Invoices dispatched successfully via PayPal Sandbox."),
        },
      ]);

      // Reload live transactions from PayPal Sandbox REST API
      await loadTransactions(activeScope);
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

  // 2. Dynamic Friends Owe You / You Owe Friends (Card 2)
  const currentUserNameLower = (currentUser?.name || "").toLowerCase().trim();
  const debtorPendingTxs = transactions.filter(
    (t) => (t.status === "pending" || t.status === "disputed" || t.status === "unresolved") && t.debtor_name !== "Self"
  );

  const userOwedBills = currentUser
    ? debtorPendingTxs.filter((t) => {
        const d = (t.debtor_name || "").toLowerCase().trim();
        return currentUserNameLower && d.length > 0 && (d.includes(currentUserNameLower) || currentUserNameLower.includes(d));
      })
    : [];

  const isUserDebtor = userOwedBills.length > 0;
  const userOwesTotal = userOwedBills.reduce((acc, t) => acc + t.amount, 0);
  const totalFriendsOwe = debtorPendingTxs.reduce((acc, t) => acc + t.amount, 0);

  const debtorSums: Record<string, number> = {};
  debtorPendingTxs.forEach((t) => {
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

  const isDebtorView = isUserDebtor && activeScope === "personal";
  const isIncomingDebtor = isDebtorView;
  const card2Title = isDebtorView ? "Pending Bills You Owe" : "Friends Owe You";
  const card2DisplayAmount = isDebtorView ? userOwesTotal : totalFriendsOwe;
  const card2Subtitle = isDebtorView
    ? `${userOwedBills[0]?.merchant || "Merchant invoice"}: $${userOwedBills[0]?.amount.toFixed(2)} (${userOwedBills.length} pending bill${userOwedBills.length > 1 ? "s" : ""})`
    : largestDebtorName
    ? `${largestDebtorName} owes $${largestDebtorAmount.toFixed(2)} (Largest)`
    : "All balances settled";
  const firstUnpaidBill = isUserDebtor ? userOwedBills[0] : null;

  // 3. Dynamic Upcoming Bills Due in next 7 days (Card 3)
  const outgoingBills = events.filter((e) => e.type === "outgoing");
  const upcomingBillsAmount = outgoingBills.reduce((sum, e) => sum + e.amount, 0);
  const firstUpcomingBill = outgoingBills[0];
  const billsSubtitle = firstUpcomingBill
    ? `${firstUpcomingBill.counterparty || firstUpcomingBill.title.split("(")[0].trim()} ($${firstUpcomingBill.amount.toFixed(0)}) on ${firstUpcomingBill.date}`
    : "No scheduled bills due";

  // 4. Dynamic Action Needed / Triage (Card 4)
  const disputedCount = transactions.filter((t) => t.status === "disputed").length;
  const unresolvedCount = transactions.filter(
    (t) => t.status === "unresolved" || t.debtor_name === "Unassigned" || t.category === "Uncategorized"
  ).length;
  const totalActionRequired = disputedCount + unresolvedCount + (isIncomingDebtor ? 1 : 0);

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
            <span className="font-mono">
              {currentUser ? "Sandbox Connected" : "Master Sandbox (Guest Mode)"}
            </span>
          </div>

          {/* Log in with PayPal / Authenticated User */}
          {currentUser ? (
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-blue-500/30 text-xs shadow-sm">
              <div className="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center font-bold text-[10px] text-blue-300">
                {currentUser.avatar}
              </div>
              <div className="flex flex-col">
                <span className="text-zinc-200 font-semibold leading-tight">{currentUser.name}</span>
                <span className="text-[10px] text-zinc-400 font-mono leading-tight truncate max-w-[150px]">
                  {currentUser.email}
                </span>
              </div>
              <div className="flex items-center ml-2 border-l border-zinc-800 pl-2">
                <button
                  onClick={handleUserLogout}
                  className="text-xs text-zinc-400 hover:text-rose-400 font-medium cursor-pointer transition-colors"
                >
                  Log Out
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0070ba] hover:bg-[#005ea6] active:bg-[#003087] text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
              </svg>
              <span>Log in with PayPal</span>
            </button>
          )}
        </div>
      </header>

      {/* Guest Mode Indicator Banner (Shown when user is not signed in) */}
      {!currentUser && (
        <div className="mb-6 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <p className="text-zinc-300">
              <span className="font-semibold text-zinc-100">Viewing Master Developer Sandbox Ledger:</span> Currently displaying transactions belonging to the master sandbox merchant account. Sign in to switch to your individual Sandbox Buyer or Merchant profile.
            </p>
          </div>
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/30 self-start sm:self-auto cursor-pointer transition-colors shrink-0"
          >
            Sign In with Sandbox User
          </button>
        </div>
      )}

      {/* Incoming Invoice Alert Banner (Shown when active user has a pending bill) */}
      {firstUnpaidBill && activeScope === "personal" && (
        <div className="mb-6 p-4 rounded-xl bg-blue-950/40 border border-blue-500/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg shadow-blue-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-zinc-100">
                  Incoming PayPal Sandbox Invoice: {firstUnpaidBill.id}
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  Payment Due
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                <span className="text-zinc-200 font-semibold">{firstUnpaidBill.merchant}</span> &mdash; Pending allocation of <span className="text-emerald-400 font-mono font-bold">${firstUnpaidBill.amount.toFixed(2)} USD</span> for {firstUnpaidBill.debtor_name}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
            <button
              onClick={() => {
                handleSendMessage(`Review incoming invoice ${firstUnpaidBill.id} for $${firstUnpaidBill.amount.toFixed(2)} from ${firstUnpaidBill.merchant}`);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 cursor-pointer transition-all"
            >
              <span>Review in Chat</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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

        {/* Card 2: Friends Owe You or You Owe Friends */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">
              {card2Title}
            </p>
            <p
              className={`text-lg font-bold font-mono mt-0.5 ${
                isDebtorView ? "text-rose-400" : "text-amber-400"
              }`}
            >
              ${card2DisplayAmount.toFixed(2)}{" "}
              {isDebtorView ? "Due" : "Owed"}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
              {card2Subtitle}
            </p>
          </div>
          <div
            className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
              isDebtorView
                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
            }`}
          >
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Upcoming Bills Due (Next 7 Days) */}
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Upcoming Bills Due</p>
            <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">
              ${upcomingBillsAmount.toFixed(2)} Due
            </p>
            <p className="text-[11px] text-blue-400 mt-0.5 truncate max-w-[220px]">
              {billsSubtitle}
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
                {/* Actions Bar for Live PayPal Sandbox */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-300">Live PayPal Ledger</span>

                    {/* Multi-User Scoped View Toggle */}
                    {currentUser ? (
                      <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px]">
                        <button
                          onClick={() => {
                            setActiveScope("personal");
                            void loadTransactions("personal");
                          }}
                          className={`px-2.5 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                            activeScope === "personal"
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                          title={`Show only activity for ${currentUser.name}`}
                        >
                          My Invoices ({transactions.length})
                        </button>
                        <button
                          onClick={() => {
                            setActiveScope("all");
                            void loadTransactions("all");
                          }}
                          className={`px-2.5 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                            activeScope === "all"
                              ? "bg-zinc-800 text-zinc-200 shadow-sm"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                          title="Show all PayPal Sandbox records across platform"
                        >
                          All Sandbox ({totalPlatformCount || transactions.length})
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                        {transactions.length} Sandbox Records
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void loadTransactions(activeScope)}
                      disabled={isLoadingTransactions}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs border border-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
                      title="Refresh transactions from PayPal Sandbox REST API"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTransactions ? "animate-spin text-blue-400" : ""}`} />
                      <span>Refresh</span>
                    </button>

                    <button
                      onClick={handleSeedSandboxTransactions}
                      disabled={isSeedingTransactions}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
                      title="Sync live transactions & invoices directly from PayPal Developer APIs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{isSeedingTransactions ? "Syncing..." : "Sync PayPal Activity"}</span>
                    </button>
                  </div>
                </div>

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
                  {transactions.length === 0 && !isLoadingTransactions ? (
                    <div className="h-full min-h-[440px] rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3">
                        <CreditCard className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-zinc-100">
                        {currentUser
                          ? `No Scoped Activity for ${currentUser.name}`
                          : "No Sandbox Transactions Found"}
                      </h3>
                      <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-4">
                        {currentUser
                          ? `You currently have 0 pending invoices or personal charges. Try clicking "All Sandbox" above, or ask PocketMate in chat: "Split $80 dinner with friends".`
                          : "Your PayPal Sandbox account currently has 0 recorded transactions. Click below to generate realistic invoices and transactions directly in PayPal Sandbox."}
                      </p>
                      <button
                        onClick={handleSeedSandboxTransactions}
                        disabled={isSeedingTransactions}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{isSeedingTransactions ? "Syncing PayPal..." : "Sync Live PayPal Transactions"}</span>
                      </button>
                    </div>
                  ) : (
                    <TransactionGrid
                      rowData={transactions}
                      gridMutation={gridMutation}
                      selectedCategory={selectedCategory}
                    />
                  )}
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
                events={events}
                onAddEvent={handleAddScheduledEvent}
                onEventClick={handleSchedulerEventClick}
              />
            )}
          </div>
        </div>
      </div>

      {/* PayPal Sandbox Login & Session Switch Modal */}
      <PayPalLoginModal
        isOpen={isLoginModalOpen}
        currentUser={currentUser}
        onClose={() => setIsLoginModalOpen(false)}
        onLogin={handleUserLogin}
        onLogout={handleUserLogout}
      />

      {/* Recipient Invoice Action Modal (Pay via official PayPal sandbox link, Dispute or Propose Adjustment) */}
      <InvoiceActionModal
        invoice={activeInvoiceForAction}
        isOpen={!!activeInvoiceForAction}
        onClose={() => setActiveInvoiceForAction(null)}
        onPay={handlePayInvoice}
        onDecline={handleDeclineInvoice}
        onRequestAdjustment={handleAdjustmentRequest}
      />
    </main>
  );
}
