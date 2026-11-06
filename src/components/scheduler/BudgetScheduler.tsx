"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ListFilter,
  Plus,
  DollarSign,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  AlertCircle,
  Tag,
} from "lucide-react";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";

export interface ScheduledEvent {
  id: string;
  title: string;
  amount: number;
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  type: "incoming" | "outgoing" | "milestone";
  category: string;
  counterparty?: string;
  status: "pending" | "scheduled" | "completed";
}

export interface BudgetSchedulerProps {
  categories?: CategoryItem[];
  selectedCategory?: string;
  onEventClick?: (eventName: string) => void;
}

const INITIAL_EVENTS: ScheduledEvent[] = [
  {
    id: "evt_1",
    title: "PayPal Invoice: Dave Chen",
    amount: 65.0,
    date: "2026-11-08",
    dayOfMonth: 8,
    type: "incoming",
    category: "Dining",
    counterparty: "Dave Chen",
    status: "pending",
  },
  {
    id: "evt_2",
    title: "Settlement Due: Alex Miller",
    amount: 42.5,
    date: "2026-11-10",
    dayOfMonth: 10,
    type: "incoming",
    category: "Dining",
    counterparty: "Alex Miller",
    status: "pending",
  },
  {
    id: "evt_3",
    title: "Cloud Infrastructure (AWS & DO)",
    amount: 95.0,
    date: "2026-11-12",
    dayOfMonth: 12,
    type: "outgoing",
    category: "Utilities",
    counterparty: "AWS",
    status: "scheduled",
  },
  {
    id: "evt_4",
    title: "Sarah Jenkins: Zara Split Due",
    amount: 79.0,
    date: "2026-11-13",
    dayOfMonth: 13,
    type: "incoming",
    category: "Shopping",
    counterparty: "Sarah Jenkins",
    status: "pending",
  },
  {
    id: "evt_5",
    title: "Mid-Month Budget Checkpoint",
    amount: 0,
    date: "2026-11-15",
    dayOfMonth: 15,
    type: "milestone",
    category: "General",
    status: "scheduled",
  },
  {
    id: "evt_6",
    title: "Entertainment Subscriptions (Netflix, Spotify)",
    amount: 24.99,
    date: "2026-11-18",
    dayOfMonth: 18,
    type: "outgoing",
    category: "Entertainment",
    counterparty: "Streaming Services",
    status: "scheduled",
  },
  {
    id: "evt_7",
    title: "SaaS Dev Tools (GitHub & OpenAI)",
    amount: 45.0,
    date: "2026-11-20",
    dayOfMonth: 20,
    type: "outgoing",
    category: "Utilities",
    counterparty: "GitHub",
    status: "scheduled",
  },
  {
    id: "evt_8",
    title: "End-of-Month Triage & Sweep",
    amount: 0,
    date: "2026-11-28",
    dayOfMonth: 28,
    type: "milestone",
    category: "General",
    status: "scheduled",
  },
];

export default function BudgetScheduler({
  categories = [],
  selectedCategory = "all",
  onEventClick,
}: BudgetSchedulerProps) {
  const [viewMode, setViewMode] = useState<"calendar" | "agenda">("calendar");
  const [events, setEvents] = useState<ScheduledEvent[]>(INITIAL_EVENTS);
  const [filterType, setFilterType] = useState<"all" | "incoming" | "outgoing">("all");

  // Modal for "+ Add Scheduled Bill / Reminder"
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("50");
  const [newDate, setNewDate] = useState("2026-11-15");
  const [newType, setNewType] = useState<"incoming" | "outgoing" | "milestone">("outgoing");
  const [newCategory, setNewCategory] = useState("Dining");
  const [newCounterparty, setNewCounterparty] = useState("");

  // Filtered events
  const displayedEvents = useMemo(() => {
    return events.filter((e) => {
      const matchType = filterType === "all" || e.type === filterType;
      const matchCat =
        selectedCategory.toLowerCase() === "all" ||
        e.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchType && matchCat;
    });
  }, [events, filterType, selectedCategory]);

  // Aggregate metrics
  const upcomingBills = useMemo(() => {
    return events
      .filter((e) => e.type === "outgoing")
      .reduce((sum, e) => sum + e.amount, 0);
  }, [events]);

  const upcomingReceivables = useMemo(() => {
    return events
      .filter((e) => e.type === "incoming")
      .reduce((sum, e) => sum + e.amount, 0);
  }, [events]);

  const netCashflow = upcomingReceivables - upcomingBills;

  // Calendar generation for November 2026 (starts on Sunday Nov 1, 30 days)
  const calendarDays = useMemo(() => {
    // Nov 1, 2026 was a Sunday (0 offset in standard Sun-Sat week)
    const daysInMonth = 30;
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `2026-11-${day < 10 ? `0${day}` : day}`;
      const dayEvents = displayedEvents.filter((e) => e.dayOfMonth === day);
      days.push({
        day,
        dateStr,
        events: dayEvents,
        isToday: day === 6, // Nov 6 is today per project anchor date
      });
    }
    return days;
  }, [displayedEvents]);

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const amt = parseFloat(newAmount) || 0;
    const parsedDay = parseInt(newDate.split("-")[2], 10) || 15;

    const created: ScheduledEvent = {
      id: `evt_${Date.now()}`,
      title: newTitle.trim(),
      amount: amt,
      date: newDate,
      dayOfMonth: parsedDay,
      type: newType,
      category: newCategory,
      counterparty: newCounterparty.trim() || undefined,
      status: "scheduled",
    };

    setEvents((prev) => [...prev, created]);
    setIsAddModalOpen(false);
    setNewTitle("");
    setNewAmount("50");
    setNewCounterparty("");
  };

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden shadow-xl">
      {/* Top Header & Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              Upcoming & Due Calendar
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                November 2026
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Clear visual payment timeline: Expected receivables, recurring bills & budget check-ins
            </p>
          </div>
        </div>

        {/* Cashflow Summary & Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 text-xs font-mono bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Receivables: +${upcomingReceivables.toFixed(2)}</span>
            </div>
            <div className="w-px h-3 bg-zinc-800" />
            <div className="flex items-center gap-1.5 text-rose-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Bills Due: -${upcomingBills.toFixed(2)}</span>
            </div>
          </div>

          {/* Add Event Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bill / Reminder</span>
          </button>
        </div>
      </div>

      {/* View Switcher & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2 bg-zinc-900/60 border-b border-zinc-800/80 text-xs">
        {/* Calendar vs Agenda Tabs */}
        <div className="flex items-center bg-zinc-950 border border-zinc-800 p-0.5 rounded-lg">
          <button
            onClick={() => setViewMode("calendar")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              viewMode === "calendar"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Month Grid</span>
          </button>

          <button
            onClick={() => setViewMode("agenda")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              viewMode === "agenda"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Timeline Agenda</span>
          </button>
        </div>

        {/* Directional Type Filters */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-zinc-500 text-[11px] hidden sm:inline">Filter:</span>
          <button
            onClick={() => setFilterType("all")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
              filterType === "all"
                ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                : "bg-transparent text-zinc-400 border-transparent hover:text-zinc-200"
            }`}
          >
            All Items ({events.length})
          </button>

          <button
            onClick={() => setFilterType("incoming")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
              filterType === "incoming"
                ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/60"
                : "bg-transparent text-zinc-400 border-transparent hover:text-emerald-400"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Receivables (Money In)
          </button>

          <button
            onClick={() => setFilterType("outgoing")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
              filterType === "outgoing"
                ? "bg-rose-950/80 text-rose-300 border-rose-800/60"
                : "bg-transparent text-zinc-400 border-transparent hover:text-rose-400"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Bills (Money Out)
          </button>
        </div>
      </div>

      {/* Main View Container */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {viewMode === "calendar" ? (
          /* Month Grid View */
          <div className="flex flex-col h-full min-h-[460px]">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-zinc-400 pb-2 border-b border-zinc-800/80">
              <span>SUN</span>
              <span>MON</span>
              <span>TUE</span>
              <span>WED</span>
              <span>THU</span>
              <span>FRI</span>
              <span>SAT</span>
            </div>

            {/* 30-Day Grid */}
            <div className="grid grid-cols-7 gap-1.5 flex-1 pt-2">
              {calendarDays.map((day) => (
                <div
                  key={day.day}
                  className={`min-h-[85px] sm:min-h-[95px] p-1.5 rounded-lg border transition-all flex flex-col justify-between ${
                    day.isToday
                      ? "bg-zinc-900/90 border-blue-500/60 shadow-xs shadow-blue-500/10"
                      : "bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                        day.isToday
                          ? "bg-blue-600 text-white"
                          : "text-zinc-400"
                      }`}
                    >
                      {day.day}
                    </span>
                    {day.isToday && (
                      <span className="text-[9px] font-semibold text-blue-400 uppercase tracking-tight">
                        Today
                      </span>
                    )}
                  </div>

                  {/* Day Events Badges */}
                  <div className="flex flex-col gap-1 mt-1 overflow-hidden">
                    {day.events.map((evt) => {
                      const isIncoming = evt.type === "incoming";
                      const isOutgoing = evt.type === "outgoing";

                      return (
                        <button
                          key={evt.id}
                          onClick={() => onEventClick?.(evt.title)}
                          className={`w-full text-left p-1 rounded text-[10px] truncate transition-all cursor-pointer font-medium border ${
                            isIncoming
                              ? "bg-emerald-950/70 border-emerald-800/50 text-emerald-300 hover:bg-emerald-900/80"
                              : isOutgoing
                              ? "bg-blue-950/70 border-blue-800/50 text-blue-300 hover:bg-blue-900/80"
                              : "bg-purple-950/70 border-purple-800/50 text-purple-300 hover:bg-purple-900/80"
                          }`}
                          title={`${evt.title} - $${evt.amount.toFixed(2)}`}
                        >
                          <span className="font-bold">
                            {evt.amount > 0 ? `$${evt.amount.toFixed(0)} ` : ""}
                          </span>
                          <span className="truncate">{evt.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Agenda / Chronological Timeline View */
          <div className="flex flex-col gap-3">
            <p className="text-xs text-zinc-400 mb-1">
              Upcoming financial milestones ordered chronologically. Click any item to inspect details or ask the agent to act on it.
            </p>

            <div className="flex flex-col gap-2.5">
              {displayedEvents.map((evt) => {
                const isIncoming = evt.type === "incoming";
                const isOutgoing = evt.type === "outgoing";

                return (
                  <div
                    key={evt.id}
                    onClick={() => onEventClick?.(evt.title)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          isIncoming
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : isOutgoing
                            ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                            : "bg-purple-500/10 border-purple-500/20 text-purple-400"
                        }`}
                      >
                        {isIncoming ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : isOutgoing ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-zinc-100 flex items-center gap-2">
                          {evt.title}
                          <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                            {evt.category}
                          </span>
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {evt.counterparty ? `Counterparty: ${evt.counterparty} · ` : ""}
                          Scheduled Date: <span className="text-zinc-300 font-mono">{evt.date}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-800">
                      <div className="text-right">
                        <span
                          className={`text-sm font-bold font-mono block ${
                            isIncoming
                              ? "text-emerald-400"
                              : isOutgoing
                              ? "text-zinc-100"
                              : "text-purple-400"
                          }`}
                        >
                          {evt.amount > 0 ? `${isIncoming ? "+" : "-"}$${evt.amount.toFixed(2)}` : "Milestone"}
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase">
                          {evt.type === "incoming" ? "Expected In" : evt.type === "outgoing" ? "Bill Due" : "Action"}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status / Legend */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-zinc-900 border-t border-zinc-800 text-[11px] text-zinc-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Receivables (Split Due)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" /> Subscriptions & Bills
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-400" /> Checkpoints
          </span>
        </div>
        <span className="text-zinc-500 text-[10px]">
          Click any event to draft PayPal invoice or request AI advice
        </span>
      </div>

      {/* Modal: Add Scheduled Bill or Reminder */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/90">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Schedule Payment / Reminder</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="p-5 flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Payment / Milestone Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Electric Bill, Gym Membership, Sarah Split"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">
                    Amount ($)
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-zinc-500" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      required
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 font-mono focus:outline-hidden focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 font-mono focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">
                    Payment Flow
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as "incoming" | "outgoing" | "milestone")}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                  >
                    <option value="outgoing">Bill (Money Out)</option>
                    <option value="incoming">Receivable (Money In)</option>
                    <option value="milestone">Budget Checkpoint</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    <option value="Utilities">Utilities</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Counterparty / Debtor (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex Miller, Landlord, Spotify"
                  value={newCounterparty}
                  onChange={(e) => setNewCounterparty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-md"
                >
                  Schedule Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
