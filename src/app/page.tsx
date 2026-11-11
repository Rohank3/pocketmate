"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { ChatPanel, ChatMessageItem } from "@/components/chat/ChatPanel";
import type { ChatThreadItem } from "@/types/chat";
import { TransactionGrid, TransactionRow } from "@/components/grid/TransactionGrid";
import { ActionCardData } from "@/components/cards/ActionConfirmCard";
import { GridMutationState } from "@/types/agent";
import { CategoryControlBar, CategoryItem } from "@/components/categories/CategoryControlBar";
import { AddCategoryModal } from "@/components/categories/AddCategoryModal";
import { PayPalLoginModal } from "@/components/auth/PayPalLoginModal";
import { InvoiceActionModal } from "@/components/cards/InvoiceActionModal";
import { UncategorizedReviewModal } from "@/components/modals/UncategorizedReviewModal";
import { FunctionalMetricsRow } from "@/components/cards/FunctionalMetricsRow";
import { SandboxStore } from "@/lib/sandbox/sandboxStore";
import { UserAccount, InvoiceRecord } from "@/types/sandboxUser";
import { ScheduledEvent } from "@/components/scheduler/BudgetScheduler";
import { PulseBackground } from "@/components/ui/PulseBackground";
import { ensureUniqueCategoryColors } from "@/lib/utils/categoryColors";
import { LiquidGlassContainer } from "@/components/ui/LiquidGlassContainer";
import { useTheme } from "@/components/theme/ThemeContext";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  Wallet,
  CreditCard,
  CalendarDays,
  Sparkles,
  RefreshCw,
  Table2,
  BarChart3,
} from "lucide-react";

// Dynamically import Financial Insights component
const FinancialStudio = dynamic(
  () => import("@/components/studio/FinancialStudio"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full min-h-[550px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] flex flex-col items-center justify-center p-8 text-center animate-pulse">
        <div className="w-8 h-8 border-2 border-[#0070ba] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold text-[var(--fg-primary)]">Loading Insights...</p>
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
      <div className="h-full w-full min-h-[550px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] flex flex-col items-center justify-center p-8 text-center animate-pulse">
        <div className="w-8 h-8 border-2 border-[#0070ba] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold text-[var(--fg-primary)]">Loading Calendar...</p>
      </div>
    ),
  }
);

const DEFAULT_WELCOME_MESSAGE: ChatMessageItem = {
  id: "msg_welcome",
  role: "assistant",
  content: "Hi! How can I help you today?",
};

export default function Home() {
  const { theme, accentColor, tintColor, isDark } = useTheme();
  const [activePersona, setActivePersona] = useState<"GENERAL" | "FREELANCER" | "BUSINESS">("GENERAL");
  const [activeRightTab, setActiveRightTab] = useState<"transactions" | "insights" | "upcoming">("transactions");
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const transactionsRef = useRef<TransactionRow[]>([]);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isSeedingTransactions, setIsSeedingTransactions] = useState(false);
  const [gridMutation, setGridMutation] = useState<GridMutationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Multi-Thread Autonomous Chat State
  const [threads, setThreads] = useState<ChatThreadItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([DEFAULT_WELCOME_MESSAGE]);

  // Multi-user sandbox authentication & cross-account sync state
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const currentUserRef = useRef<UserAccount | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [activeScope, setActiveScope] = useState<"personal" | "all">("personal");
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [activeInvoiceForAction, setActiveInvoiceForAction] = useState<InvoiceRecord | null>(null);
  const [, setInvoices] = useState<InvoiceRecord[]>([]);

  // Modal request queue for creating a real BudgetCategory from '+ Custom...' inline flows
  const [addCategoryModalRequest, setAddCategoryModalRequest] = useState<{
    initialName: string;
    resolve: (createdName: string | null) => void;
  } | null>(null);

  const requestCreateCategory = useCallback((initialName: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setAddCategoryModalRequest({ initialName, resolve });
    });
  }, []);

  // Dynamic Categories & Scheduled Events state
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [splits, setSplits] = useState<Array<{
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
  }>>([]);

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

  // Load split records from database
  const loadSplits = useCallback(async () => {
    try {
      const res = await fetch("/api/splits");
      const data = await res.json();
      if (data.success && Array.isArray(data.splits)) {
        setSplits(data.splits);
      }
    } catch {
      // ignore
    }
  }, []);

  // Load live transactions from PayPal Sandbox (role & user-aware)
  const loadTransactions = useCallback(async (scopeOverride?: "personal" | "all") => {
    if (!currentUserRef.current) {
      setIsLoadingTransactions(false);
      return;
    }
    setIsLoadingTransactions(true);
    const scopeToUse = scopeOverride || activeScope;
    try {
      const res = await fetch(`/api/paypal/transactions?scope=${scopeToUse}`);
      if (res.status === 401) {
        currentUserRef.current = null;
        setCurrentUser(null);
        setIsLoginModalOpen(true);
        return;
      }
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
        if (data.activeScope) {
          setActiveScope(data.activeScope);
        }
        // Refresh scheduled events so newly reconciled/detected bills reflect immediately
        void loadEvents();
        void loadSplits();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [activeScope, loadEvents, loadSplits]);

  // 1-Click orchestrate realistic PayPal Sandbox transactions & invoices
  const handleSeedSandboxTransactions = async () => {
    setIsSeedingTransactions(true);
    try {
      const res = await fetch("/api/paypal/seed", { method: "POST" });
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
        await loadTransactions(activeScope);
        await loadEvents();
        await loadSplits();
        setMessages((prev) => [
          ...prev,
          {
            id: `asst_sync_${Date.now()}`,
            role: "assistant",
            content: "I've synchronized your recent PayPal transactions and updated your ledger and bills.",
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
        const rawCats = catData.categories.map((c: { id: string; name: string; monthlyCap: number; color?: string }) => ({
          id: c.id,
          name: c.name,
          monthlyCap: c.monthlyCap,
          color: c.color,
        }));
        setCategories(ensureUniqueCategoryColors(rawCats));
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial load effect
  useEffect(() => {
    let isSubscribed = true;

    const init = async () => {
      let authedUser: UserAccount | null = null;
      try {
        const userRes = await fetch("/api/auth/me");
        const userData = await userRes.json();
        if (isSubscribed && userData.user) {
          authedUser = userData.user;
          currentUserRef.current = userData.user;
          setCurrentUser(userData.user);
        } else if (isSubscribed) {
          currentUserRef.current = null;
          setCurrentUser(null);
          setIsLoginModalOpen(true);
        }
      } catch {
        if (isSubscribed) {
          currentUserRef.current = null;
          setCurrentUser(null);
          setIsLoginModalOpen(true);
        }
      } finally {
        if (isSubscribed) {
          setIsAuthChecked(true);
        }
      }

      if (!authedUser) {
        if (isSubscribed) setIsLoadingTransactions(false);
        return;
      }

      try {
        const txRes = await fetch("/api/paypal/transactions");
        const txData = await txRes.json();
        if (isSubscribed && txData.transactions) {
          setTransactions(txData.transactions);
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
      await loadSplits();

      if (isSubscribed) {
        setInvoices(SandboxStore.getInvoices());
      }

      // Check if redirected from PayPal OAuth callback
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("connected") === "paypal") {
          const rawUserName = params.get("userName") || "PayPal User";
          const userName = rawUserName.replace(/[<>[\]()]/g, "").slice(0, 50);
          const firstName = userName.split(" ")[0] || userName;
          if (isSubscribed) {
            setMessages((prev) => [
              ...prev,
              {
                id: `asst_connected_${Date.now()}`,
                role: "assistant",
                content: `Hi ${firstName}! How can I help you today?`,
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
      if (currentUserRef.current) {
        void loadTransactions();
      }
    };
    window.addEventListener("focus", onFocus);

    // Periodic background sync every 25 seconds when browser tab is active
    const interval = setInterval(() => {
      if (
        currentUserRef.current &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        void loadTransactions();
      }
    }, 25000);

    return () => {
      isSubscribed = false;
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [loadCategories, loadEvents, loadSplits, loadTransactions]);

  // Request & Trigger Web Notifications for bills due in <= 48 hours
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || events.length === 0) return;

    if (Notification.permission === "default") {
      void Notification.requestPermission();
    } else if (Notification.permission === "granted") {
      const todayDay = new Date().getDate();
      const urgentBills = events.filter((e) => {
        if (e.type !== "outgoing" || e.status === "completed") return false;
        const day = e.dayOfMonth || (e.date ? parseInt(e.date.slice(8, 10)) : 15);
        const diff = day - todayDay;
        return diff >= 0 && diff <= 2;
      });

      if (urgentBills.length > 0) {
        const notifKey = `pm_bill_alert_${new Date().toISOString().slice(0, 10)}`;
        if (!sessionStorage.getItem(notifKey)) {
          sessionStorage.setItem(notifKey, "true");
          const b = urgentBills[0];
          try {
            new Notification("PocketMate: Bill Due Soon", {
              body: `Reminder: ${b.title} ($${b.amount.toFixed(2)}) is due within 48 hours.`,
            });
          } catch {
            // ignore
          }
        }
      }
    }
  }, [events]);

  // Clean all legacy chat keys from localStorage on startup/mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith("pocketmate_messages_") ||
              key.startsWith("pocketmate_threads_") ||
              key.startsWith("pocketmate_active_thread_"))
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {
        // ignore
      }
    }
  }, []);

  // Load messages for a specific thread strictly from database API
  const loadThreadMessages = useCallback(async (threadId: string, user?: UserAccount | null) => {
    if (user?.email) {
      try {
        const res = await fetch(`/api/chat/messages?threadId=${threadId}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          if (data.messages.length > 0) {
            setMessages(data.messages.slice(-30));
          } else {
            setMessages([DEFAULT_WELCOME_MESSAGE]);
          }
          return;
        }
      } catch (err) {
        console.warn("[Load Messages Warning]", err);
      }
    }
    setMessages([DEFAULT_WELCOME_MESSAGE]);
  }, []);

  // Multi-thread chat hydration & synchronization effect (PostgreSQL sole source of truth)
  useEffect(() => {
    let isSubscribed = true;

    const hydrateThreads = async () => {
      if (currentUser?.email) {
        try {
          const res = await fetch("/api/chat/threads");
          const data = await res.json();
          if (!isSubscribed) return;

          if (data.success && Array.isArray(data.threads) && data.threads.length > 0) {
            const serverThreads: ChatThreadItem[] = data.threads;
            setThreads(serverThreads);
            const targetId = serverThreads[0].id;
            setActiveThreadId(targetId);
            void loadThreadMessages(targetId, currentUser);
            return;
          }
        } catch (err) {
          console.warn("[Thread Fetch Error]", err);
        }
      }

      // If no threads exist on server (or guest), create clean initial state
      const defaultId = `th_${Date.now()}`;
      const defaultThread: ChatThreadItem = {
        id: defaultId,
        title: "New Conversation",
        messageCount: 1,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      if (isSubscribed) {
        setActiveThreadId(defaultId);
        setThreads([defaultThread]);
        setMessages([DEFAULT_WELCOME_MESSAGE]);
      }
    };

    void hydrateThreads();

    return () => {
      isSubscribed = false;
    };
  }, [currentUser, loadThreadMessages]);

  const handleNewChat = useCallback(async () => {
    const newThreadId = `th_${Date.now()}`;
    const newThread: ChatThreadItem = {
      id: newThreadId,
      title: "New Conversation",
      messageCount: 1,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(newThreadId);
    setMessages([DEFAULT_WELCOME_MESSAGE]);

    if (currentUser?.email) {
      try {
        const res = await fetch("/api/chat/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Conversation" }),
        });
        const data = await res.json();
        if (data.success && data.thread?.id) {
          const serverId = data.thread.id;
          setActiveThreadId(serverId);
          setThreads((prev) =>
            prev.map((t) => (t.id === newThreadId ? { ...t, id: serverId } : t))
          );
        }
      } catch (err) {
        console.warn("[Create Thread Server Warning]", err);
      }
    }
  }, [currentUser]);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId);
      void loadThreadMessages(threadId, currentUser);
    },
    [currentUser, loadThreadMessages]
  );

  const handleRenameThread = useCallback(
    async (threadId: string, newTitle: string) => {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t))
      );

      if (currentUser?.email) {
        try {
          await fetch("/api/chat/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: threadId, title: newTitle }),
          });
        } catch (err) {
          console.warn("[Rename Thread Server Warning]", err);
        }
      }
    },
    [currentUser]
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const remaining = threads.filter((t) => t.id !== threadId);
      setThreads(remaining);

      if (threadId === activeThreadId) {
        if (remaining.length > 0) {
          handleSelectThread(remaining[0].id);
        } else {
          void handleNewChat();
        }
      }

      if (currentUser?.email) {
        try {
          await fetch(`/api/chat/threads?id=${threadId}`, { method: "DELETE" });
        } catch (err) {
          console.warn("[Delete Thread Server Warning]", err);
        }
      }
    },
    [activeThreadId, currentUser, handleNewChat, handleSelectThread, threads]
  );

  const handleUserLogin = (user: UserAccount) => {
    currentUserRef.current = user;
    setCurrentUser(user);
    setActiveScope("personal");
    void loadTransactions("personal");
    void loadCategories();
    void loadEvents();
    void loadSplits();
    setIsLoginModalOpen(false);

    const firstName = user.name.split(" ")[0] || user.name;
    setMessages((prev) => [
      ...prev,
      {
        id: `asst_welcome_user_${Date.now()}`,
        role: "assistant",
        content: `Hi ${firstName}! How can I help you today?`,
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
    currentUserRef.current = null;
    setCurrentUser(null);
    setTransactions([]);
    setCategories([]);
    setSplits([]);
    setEvents([]);
    setIsLoginModalOpen(true);
    setMessages([DEFAULT_WELCOME_MESSAGE]);
  };

  const handleAddCategory = useCallback(
    async (
      newCat: Omit<CategoryItem, "id">,
      options?: { selectCreated?: boolean }
    ): Promise<CategoryItem | null> => {
      try {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newCat),
        });
        const data = await res.json();
        if (res.ok && data.category) {
          const created: CategoryItem = data.category;
          setCategories((prev) => {
            const exists = prev.some(
              (c) => c.id === created.id || c.name.toLowerCase() === created.name.toLowerCase()
            );
            const next = exists
              ? prev.map((c) =>
                  c.id === created.id || c.name.toLowerCase() === created.name.toLowerCase()
                    ? created
                    : c
                )
              : [...prev, created];
            return ensureUniqueCategoryColors(next);
          });
          if (options?.selectCreated !== false) {
            setSelectedCategory(created.name);
          }
          return created;
        }
      } catch (err) {
        console.error("[Add Category Error]", err);
      }
      return null;
    },
    []
  );

  const handleEditCategory = async (
    categoryId: string,
    updatedCap: number,
    updatedName?: string,
    updatedColor?: string,
    reinitialize?: boolean
  ) => {
    try {
      await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: categoryId,
          monthlyCap: updatedCap,
          name: updatedName,
          color: updatedColor,
          reinitialize,
        }),
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

    if (reinitialize) {
      void loadTransactions();
    }
  };

  const handleReclassifyTransaction = async (
    transactionId: string,
    merchantName: string,
    targetCategory: string,
    scope: "single" | "merchant" | "similar"
  ) => {
    try {
      const currentTransactions: TransactionRow[] = transactionsRef.current;
      const res = await fetch("/api/transactions/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          merchantName,
          targetCategory,
          scope,
          allTransactions: currentTransactions.map((t) => ({
            id: t.id,
            merchantName: t.merchant,
            memo: t.memo,
            amount: t.amount,
            category: t.category,
          })),
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.updatedTransactionIds)) {
        const idSet = new Set(data.updatedTransactionIds);
        const updatedTxs = currentTransactions.map((t) =>
          idSet.has(t.id) ? { ...t, category: targetCategory } : t
        );
        transactionsRef.current = updatedTxs;
        setTransactions(updatedTxs);
        void loadCategories();

        const warningNotice = data.warning ? `\n\n⚠️ ${data.warning}` : "";

        // Check if there are remaining uncategorized items across the ledger via Gemini AI
        if (data.nextSuggestion) {
          const next = data.nextSuggestion;
          setMessages((prev) => [
            ...prev,
            {
              id: `asst_triage_next_${Date.now()}`,
              role: "assistant",
              content: `Reclassified **${merchantName}** as *${targetCategory}*.${warningNotice} **${next.remainingCount} unclassified transaction(s) remaining** in your ledger. Next up: **${next.merchantName}** ($${next.amount.toFixed(2)}).`,
              actionCard: {
                action: "CATEGORY_TRIAGE",
                type: "category_triage",
                transactionId: next.transactionId,
                merchantName: next.merchantName,
                amount: next.amount,
                suggestedCategory: next.suggestedCategory,
                confidence: next.confidence,
                reasoning: next.reasoning,
              },
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `asst_triage_complete_${Date.now()}`,
              role: "assistant",
              content: `🎉 **All transactions classified!** Every item in your ledger has been categorized and your budget spending caps are up to date.${warningNotice}`,
            },
          ]);
        }
      }
      return data;
    } catch (err) {
      console.error("[Reclassify Transaction Error]", err);
      throw err;
    }
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

  const handleDeleteScheduledEvent = async (eventId: string) => {
    try {
      await fetch(`/api/events?id=${eventId}`, { method: "DELETE" });
    } catch (err) {
      console.error(err);
    }
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  const handleToggleScheduledEventStatus = async (eventId: string, newStatus: "pending" | "scheduled" | "completed") => {
    try {
      await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eventId, status: newStatus }),
      });
    } catch (err) {
      console.error(err);
    }
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, status: newStatus } : e))
    );
  };

  const handleCancelSubscription = async (eventId: string, updatedCounterparty: string) => {
    try {
      await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: eventId, counterparty: updatedCounterparty, status: "completed" }),
      });
    } catch (err) {
      console.error(err);
    }
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, counterparty: updatedCounterparty, status: "completed" }
          : e
      )
    );
  };

  const handlePayInvoice = (invoiceId: string) => {
    const paid = SandboxStore.settleInvoice(invoiceId);
    if (paid) {
      setInvoices(SandboxStore.getInvoices());
      void loadTransactions(activeScope);
      void loadSplits();
      setMessages((prev) => [
        ...prev,
        {
          id: `asst_paid_${Date.now()}`,
          role: "assistant",
          content: `Payment of $${paid.amount.toFixed(2)} for ${paid.senderName} (${paid.paypalInvoiceId}) is confirmed and settled. Your ledger has been updated.`,
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
          threadId: activeThreadId || undefined,
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
      let calledMutatingTool = false;

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

            if (event === "thread_created" && data.thread) {
              const newT: ChatThreadItem = data.thread;
              setActiveThreadId(newT.id);
              setThreads((prev) => [newT, ...prev.filter((t) => t.id !== newT.id)]);
            } else if (event === "thread_renamed" && data.id && data.title) {
              setThreads((prev) =>
                prev.map((t) => (t.id === data.id ? { ...t, title: data.title } : t))
              );
            } else if (event === "text_delta" && data.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + data.text }
                    : m
                )
              );
            } else if (event === "tool_call" && data.name) {
              if (
                data.name === "auto_categorize_transactions" ||
                data.name === "set_transaction_category" ||
                data.name === "set_merchant_category_rule" ||
                data.name === "log_category_expense" ||
                data.name === "initiate_paypal_dispute"
              ) {
                calledMutatingTool = true;
              }
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
            } else if (event === "done") {
              if (calledMutatingTool) {
                void loadTransactions(activeScope);
                void loadCategories();
              }
              if (activeThreadId) {
                setThreads((prev) =>
                  prev.map((t) =>
                    t.id === activeThreadId
                      ? {
                          ...t,
                          updatedAt: new Date().toISOString(),
                          messageCount: t.messageCount + 2,
                        }
                      : t
                  )
                );
              }
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
  }, [activePersona, activeScope, activeThreadId, loadCategories, loadTransactions, messages]);

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
            content: `I audited your receipt against the PayPal charge for **${auditData.parsedReceipt.merchantName}**. The receipt items, tax, and tip total **$${audit.receiptTotal.toFixed(2)}**, but PayPal was charged **$${audit.chargedTotal.toFixed(2)}** (a difference of **$${audit.discrepancyAmount.toFixed(2)}**).\n\nWould you like me to file a dispute for the $${audit.discrepancyAmount.toFixed(2)} surcharge, or split the full $${audit.chargedTotal.toFixed(2)}?`,
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
          content: data.reply || (cardData.action === "DISPATCH_PAYOUT" ? "Payout executed successfully via PayPal Sandbox." : "Invoices dispatched successfully via PayPal Sandbox."),
        },
      ]);

      // Reload live transactions from PayPal Sandbox REST API
      await loadTransactions(activeScope);
      await loadSplits();
      await loadEvents();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelAction = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, actionCard: undefined } : m
      )
    );
  };

  return (
    <>
      {/* Living Ambient Pulse Stripe Background in Selected Color Theme */}
      <PulseBackground palette={theme} />

      <main className="relative z-10 min-h-screen overflow-x-clip text-[var(--fg-primary)] flex flex-col p-3 md:p-6 lg:p-8">
        {/* Top Navigation & Brand Header */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] shadow-xs backdrop-blur-md">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[var(--fg-primary)] flex items-center gap-2">
                  PocketMate
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--status-info-bg)] text-[var(--status-info-text)] border border-[var(--status-info-border)] font-semibold">
                    Live
                  </span>
                </h1>
              </div>
            </div>
          </div>

          {/* Connection & Auth Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Light / Dark Theme Toggle */}
            <ThemeToggle />

            {/* Sandbox Status Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-strong)] backdrop-blur-md text-xs text-[var(--fg-secondary)] shadow-2xs">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  isDark ? "bg-sky-400" : "bg-[#0070ba]"
                }`}
              />
              <span className="font-mono text-[11px] font-medium">
                {currentUser ? "Sandbox Connected" : "PayPal Required"}
              </span>
            </div>

            {/* User Account / PayPal Login Button */}
            {currentUser ? (
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[var(--surface-card)] border border-[var(--accent-border)] backdrop-blur-md text-xs shadow-2xs">
                <div className="w-6 h-6 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-[10px] text-[var(--accent-text)]">
                  {currentUser.avatar}
                </div>
                <div className="flex flex-col">
                  <span className="text-[var(--fg-primary)] font-semibold leading-tight">{currentUser.name}</span>
                  <span className="text-[10px] text-[var(--fg-muted)] font-mono leading-tight truncate max-w-[140px]">
                    {currentUser.email}
                  </span>
                </div>
                <div className="flex items-center ml-2 border-l border-[var(--border-subtle)] pl-2">
                  <button
                    onClick={handleUserLogout}
                    className={`text-xs font-medium cursor-pointer transition-colors ${
                      isDark
                        ? "text-slate-400 hover:text-rose-400"
                        : "text-slate-600 hover:text-rose-600"
                    }`}
                  >
                    Log Out
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl theme-btn-primary active:scale-[0.98] text-xs font-bold backdrop-blur-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M20.067 8.478c.492.315.844.818.996 1.424.238.948.067 2.05-.48 3.108-1.042 2.015-2.918 3.32-5.148 3.585-.453.053-.91.08-1.367.08h-.468c-.468 0-.87.332-.942.793l-.845 5.353-.028.175c-.033.206-.21.354-.42.354H8.05c-.26 0-.45-.24-.41-.497l2.128-13.49c.04-.257.26-.45.52-.45h4.636c1.69 0 3.19.467 4.143 1.565z" />
                </svg>
                <span>Log in with PayPal</span>
              </button>
            )}
          </div>
        </header>

        {/* 4 Responsive Actionable Glass Cards with Dropdowns */}
        <div className="relative z-20 mb-6">
          <FunctionalMetricsRow
            categories={categories}
            transactions={transactions}
            events={events}
            currentUser={currentUser}
            splits={splits}
            activeScope={activeScope}
            onNavigateTab={(tab) => setActiveRightTab(tab)}
            onFilterLedger={(debtorName, categoryName) => {
              setActiveRightTab("transactions");
              if (debtorName) {
                setGridMutation({
                  filter: { debtor_name: debtorName },
                  statusMessage: `Filtered by debtor: ${debtorName}`,
                });
              } else if (categoryName) {
                setSelectedCategory(categoryName);
              }
            }}
            onSendChatMessage={(prompt) => {
              void handleSendMessage(prompt);
            }}
            onOpenReviewModal={() => setIsReviewModalOpen(true)}
          />
        </div>

        {/* Main Split-View Workspace */}
        <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-5 min-h-[580px]">
          {/* Left Column: Conversational Agent (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col min-h-0 h-[640px] lg:h-[740px]">
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              categories={categories}
              threads={threads}
              activeThreadId={activeThreadId}
              onSendMessage={handleSendMessage}
              onUploadReceipt={handleUploadReceipt}
              onConfirmAction={handleConfirmAction}
              onCancelAction={handleCancelAction}
              onAssignCategory={handleReclassifyTransaction}
              onRequestCreateCategory={requestCreateCategory}
              onNewChat={handleNewChat}
              onSelectThread={handleSelectThread}
              onRenameThread={handleRenameThread}
              onDeleteThread={handleDeleteThread}
            />
          </div>

          {/* Right Column: Transactions Ledger, Visual Insights & Upcoming Due Calendar (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col min-h-0 h-[640px] lg:h-[740px]">
            <LiquidGlassContainer
              className="h-full w-full"
              contentClassName="relative flex flex-col h-full p-2.5 sm:p-3 overflow-hidden gap-3.5"
              borderRadius={28}
              glass={{
                blur: 24,
                opacity: 0.82,
                saturation: 1.8,
                tint: tintColor,
                edge: 0.9,
                distortion: 26,
              }}
              accent={accentColor}
              intensity={1}
            >
              {/* View Tab Switcher */}
            <div className="relative flex items-center justify-between p-1.5 rounded-2xl glass-strip">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setActiveRightTab("transactions")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba] ${
                    activeRightTab === "transactions"
                      ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent-border)] shadow-2xs"
                      : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] border border-transparent"
                  }`}
                >
                  <Table2 className={`w-3.5 h-3.5 ${activeRightTab === "transactions" ? "text-[var(--accent-text)]" : "text-[var(--fg-muted)]"}`} />
                  <span>Transactions</span>
                </button>

                <button
                  onClick={() => setActiveRightTab("insights")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba] ${
                    activeRightTab === "insights"
                      ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent-border)] shadow-2xs"
                      : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] border border-transparent"
                  }`}
                >
                  <BarChart3 className={`w-3.5 h-3.5 ${activeRightTab === "insights" ? "text-[var(--accent-text)]" : "text-[var(--fg-muted)]"}`} />
                  <span>Insights</span>
                </button>

                <button
                  onClick={() => setActiveRightTab("upcoming")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba] ${
                    activeRightTab === "upcoming"
                      ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent-border)] shadow-2xs"
                      : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] border border-transparent"
                  }`}
                >
                  <CalendarDays className={`w-3.5 h-3.5 ${activeRightTab === "upcoming" ? "text-[var(--accent-text)]" : "text-[var(--fg-muted)]"}`} />
                  <span>Upcoming & Due</span>
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-2 pr-3 text-[11px] text-[var(--fg-secondary)]">
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    isDark ? "bg-sky-400" : "bg-[#0070ba]"
                  }`}
                />
                <span className="font-semibold text-[var(--accent-text)]">Live</span>
              </div>
            </div>

            {/* Active View Container */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {activeRightTab === "transactions" && (
                <div className="flex flex-col gap-3 h-full min-h-0">
                  {/* Actions Bar for Live PayPal Sandbox */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[var(--fg-primary)]">Ledger</span>
                      <span
                        className="text-[11px] font-mono tabular-nums px-2.5 py-0.5 rounded-full bg-[var(--surface-subtle)] text-[var(--fg-secondary)] border border-[var(--border-subtle)] font-medium"
                        title={currentUser ? `Showing scoped records for ${currentUser.name}` : "Sandbox records"}
                      >
                        {transactions.length} records
                      </span>
                      {/* Real-time Ledger Synchronization Status */}
                      <div className="hidden sm:flex items-center gap-2 pl-1" title="Live synchronization active">
                        <span className="relative flex h-2 w-2">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDark ? "bg-sky-400" : "bg-[#0070ba]"}`}></span>
                          <span className={`relative inline-flex rounded-full h-2 w-2 ${isDark ? "bg-sky-400" : "bg-[#0070ba]"}`}></span>
                        </span>
                        <span className="text-[10px] font-mono font-bold text-[var(--accent-text)]">LIVE SYNC</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void loadTransactions(activeScope)}
                        disabled={isLoadingTransactions}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl theme-btn-secondary border text-xs font-medium shadow-2xs transition-all cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
                        title="Refresh transactions from PayPal Sandbox REST API"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTransactions ? "animate-spin text-[var(--accent-text)]" : ""}`} />
                        <span>Refresh</span>
                      </button>

                      <button
                        onClick={handleSeedSandboxTransactions}
                        disabled={isSeedingTransactions}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl theme-btn-primary text-xs font-bold transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
                        title="Sync live transactions & invoices directly from PayPal Developer APIs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isSeedingTransactions ? "Syncing..." : "Sync PayPal"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Category Control Bar scoped directly to Transactions Ledger */}
                  <CategoryControlBar
                    categories={categories}
                    selectedCategory={selectedCategory}
                    transactions={transactions}
                    onSelectCategory={setSelectedCategory}
                    onAddCategory={(newCat) => void handleAddCategory(newCat, { selectCreated: true })}
                    onEditCategory={handleEditCategory}
                    onDeleteCategory={handleDeleteCategory}
                  />

                <div className="flex-1 min-h-0">
                  {transactions.length === 0 && !isLoadingTransactions ? (
                    <div className="h-full min-h-[440px] rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-card)] backdrop-blur-md flex flex-col items-center justify-center p-8 text-center shadow-xs">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] mb-3 shadow-2xs">
                        <CreditCard className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-[var(--fg-primary)]">
                        {currentUser
                          ? `No activity for ${currentUser.name}`
                          : "No transactions found"}
                      </h3>
                      <p className="text-xs text-[var(--fg-muted)] max-w-sm mt-1 mb-4">
                        {currentUser
                          ? "Try splitting an expense in chat or syncing PayPal."
                          : "Sync PayPal Sandbox to populate ledger records."}
                      </p>
                      <button
                        onClick={handleSeedSandboxTransactions}
                        disabled={isSeedingTransactions}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl theme-btn-primary active:scale-95 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
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
                      categories={categories}
                      onReclassifyTransaction={handleReclassifyTransaction}
                      onRequestCreateCategory={requestCreateCategory}
                      onOpenReviewModal={() => setIsReviewModalOpen(true)}
                      onClearMutation={() => setGridMutation(null)}
                    />
                  )}
                </div>
              </div>
            )}
            {activeRightTab === "insights" && (
              <FinancialStudio
                categories={categories}
                transactions={transactions}
                currentUser={currentUser}
                splits={splits}
                onActionClick={handleSendMessage}
              />
            )}
            {activeRightTab === "upcoming" && (
              <BudgetScheduler
                categories={categories}
                selectedCategory={selectedCategory}
                events={events}
                onAddEvent={handleAddScheduledEvent}
                onDeleteEvent={handleDeleteScheduledEvent}
                onToggleStatus={handleToggleScheduledEventStatus}
                onCancelSubscription={handleCancelSubscription}
              />
            )}
          </div>
        </LiquidGlassContainer>
      </div>
      </div>

      {/* PayPal Sandbox Login & Session Switch Modal (Mandatory when logged out) */}
      <PayPalLoginModal
        isOpen={isLoginModalOpen || (isAuthChecked && !currentUser)}
        currentUser={currentUser}
        onClose={() => {
          if (currentUser) setIsLoginModalOpen(false);
        }}
        onLogin={handleUserLogin}
        onLogout={handleUserLogout}
      />

      {/* Shared Add Category Dialog (triggered from '+ Custom...' in Triage or Grid modals) */}
      <AddCategoryModal
        isOpen={Boolean(addCategoryModalRequest)}
        initialName={addCategoryModalRequest?.initialName || ""}
        existingCategories={categories}
        onSaveCategory={(newCat) => handleAddCategory(newCat, { selectCreated: false })}
        onCreated={(created) => {
          addCategoryModalRequest?.resolve(created.name);
          setAddCategoryModalRequest(null);
        }}
        onCancel={() => {
          addCategoryModalRequest?.resolve(null);
          setAddCategoryModalRequest(null);
        }}
      />

      {/* Recipient Invoice Action Modal (Pay via official PayPal sandbox link or Decline) */}
      <InvoiceActionModal
        invoice={activeInvoiceForAction}
        isOpen={!!activeInvoiceForAction}
        onClose={() => setActiveInvoiceForAction(null)}
        onPay={handlePayInvoice}
        onDecline={handleDeclineInvoice}
      />

      {/* Interactive Uncategorized Transactions Review & Triage Modal */}
      <UncategorizedReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        transactions={transactions}
        categories={categories}
        onAssignCategory={handleReclassifyTransaction}
      />
      </main>
    </>
  );
}
