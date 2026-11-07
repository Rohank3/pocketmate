"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Plus,
  DollarSign,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CheckCircle2,
  Circle,
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
  events?: ScheduledEvent[];
  onEventClick?: (eventName: string) => void;
  onAddEvent?: (event: Omit<ScheduledEvent, "id">) => void;
  onDeleteEvent?: (eventId: string) => void;
  onToggleStatus?: (eventId: string, newStatus: "pending" | "scheduled" | "completed") => void;
}

export default function BudgetScheduler({
  categories = [],
  selectedCategory = "all",
  events: propEvents,
  onEventClick,
  onAddEvent,
  onDeleteEvent,
  onToggleStatus,
}: BudgetSchedulerProps) {
  const [viewMode, setViewMode] = useState<"calendar" | "agenda">("calendar");
  const [internalEvents, setInternalEvents] = useState<ScheduledEvent[]>([]);
  const events = propEvents !== undefined ? propEvents : internalEvents;
  const setEvents = (updater: React.SetStateAction<ScheduledEvent[]>) => {
    setInternalEvents(updater);
  };

  // Dynamic Month & Year Navigation State
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth(); // 0-indexed
  const monthName = viewDate.toLocaleString("en-US", { month: "long" });

  useEffect(() => {
    if (propEvents === undefined) {
      fetch("/api/events")
        .then((r) => r.json())
        .then((data) => {
          if (data.events) setInternalEvents(data.events);
        })
        .catch(() => {});
    }
  }, [propEvents]);

  const [filterType, setFilterType] = useState<"all" | "incoming" | "outgoing">("all");

  // Modal for "+ Add Scheduled Bill / Reminder"
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("50");
  const [newDate, setNewDate] = useState(() => {
    const y = viewDate.getFullYear();
    const m = String(viewDate.getMonth() + 1).padStart(2, "0");
    const d = String(Math.min(15, new Date(y, viewDate.getMonth() + 1, 0).getDate())).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [newType, setNewType] = useState<"incoming" | "outgoing" | "milestone">("outgoing");
  const [newCategory, setNewCategory] = useState("Dining");
  const [newCounterparty, setNewCounterparty] = useState("");

  const handlePrevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handleJumpToToday = () => {
    setViewDate(new Date());
  };

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

  // Aggregate metrics for currently viewed month
  const currentMonthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthEvents = useMemo(() => {
    return displayedEvents.filter(
      (e) => !e.date || e.date.startsWith(currentMonthPrefix)
    );
  }, [displayedEvents, currentMonthPrefix]);

  const upcomingBills = useMemo(() => {
    return monthEvents
      .filter((e) => e.type === "outgoing" && e.status !== "completed")
      .reduce((sum, e) => sum + e.amount, 0);
  }, [monthEvents]);

  const upcomingReceivables = useMemo(() => {
    return monthEvents
      .filter((e) => e.type === "incoming" && e.status !== "completed")
      .reduce((sum, e) => sum + e.amount, 0);
  }, [monthEvents]);

  // Calendar generation with dynamic day-of-week alignment and padding
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun..6 = Sat
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const realToday = new Date();
    const isCurrentMonthViewed =
      realToday.getFullYear() === viewYear && realToday.getMonth() === viewMonth;
    const todayDate = realToday.getDate();

    const cells: Array<{
      key: string;
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      events: ScheduledEvent[];
    }> = [];

    // Leading days from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 12 : viewMonth;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        key: `prev-${dateStr}`,
        day,
        dateStr,
        isCurrentMonth: false,
        isToday: false,
        events: displayedEvents.filter((e) => e.date === dateStr),
      });
    }

    // Days in current month
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const dateStr = `${currentMonthPrefix}-${String(day).padStart(2, "0")}`;
      const dayEvents = displayedEvents.filter(
        (e) => e.date === dateStr || (!e.date && e.dayOfMonth === day)
      );
      cells.push({
        key: `cur-${dateStr}`,
        day,
        dateStr,
        isCurrentMonth: true,
        isToday: isCurrentMonthViewed && day === todayDate,
        events: dayEvents,
      });
    }

    // Trailing days to round out 7 columns
    const totalCells = Math.ceil(cells.length / 7) * 7;
    const trailingCount = totalCells - cells.length;
    for (let day = 1; day <= trailingCount; day++) {
      const nextMonth = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        key: `next-${dateStr}`,
        day,
        dateStr,
        isCurrentMonth: false,
        isToday: false,
        events: displayedEvents.filter((e) => e.date === dateStr),
      });
    }

    return cells;
  }, [viewYear, viewMonth, currentMonthPrefix, displayedEvents]);

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const amt = Math.max(0, parseFloat(newAmount) || 0);
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
    onAddEvent?.(created);
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
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-100">
                Upcoming & Due Calendar
              </h2>
              {/* Dynamic Month Navigation Controls */}
              <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  title="Previous Month"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-semibold text-purple-300 px-2 min-w-[100px] text-center">
                  {monthName} {viewYear}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  title="Next Month"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleJumpToToday}
                  title="Jump to Current Month"
                  className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer transition-colors ml-0.5"
                >
                  Today
                </button>
              </div>
            </div>
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
            onClick={() => {
              const y = viewDate.getFullYear();
              const m = String(viewDate.getMonth() + 1).padStart(2, "0");
              const d = String(Math.min(15, new Date(y, viewDate.getMonth() + 1, 0).getDate())).padStart(2, "0");
              setNewDate(`${y}-${m}-${d}`);
              setIsAddModalOpen(true);
            }}
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
          /* Month Grid View with Dynamic Day Alignment */
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

            {/* Dynamic Grid Cells with Leading/Trailing Padding */}
            <div className="grid grid-cols-7 gap-1.5 flex-1 pt-2">
              {calendarDays.map((cell) => (
                <div
                  key={cell.key}
                  className={`min-h-[85px] sm:min-h-[95px] p-1.5 rounded-lg border transition-all flex flex-col justify-between ${
                    cell.isToday
                      ? "bg-zinc-900/90 border-blue-500/60 shadow-xs shadow-blue-500/10"
                      : cell.isCurrentMonth
                      ? "bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700"
                      : "bg-zinc-950/40 border-zinc-900 text-zinc-600 opacity-60"
                  }`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                        cell.isToday
                          ? "bg-blue-600 text-white"
                          : cell.isCurrentMonth
                          ? "text-zinc-400"
                          : "text-zinc-600"
                      }`}
                    >
                      {cell.day}
                    </span>
                    {cell.isToday && (
                      <span className="text-[9px] font-semibold text-blue-400 uppercase tracking-tight">
                        Today
                      </span>
                    )}
                  </div>

                  {/* Day Events Badges */}
                  <div className="flex flex-col gap-1 mt-1 overflow-hidden">
                    {cell.events.map((evt) => {
                      const isIncoming = evt.type === "incoming";
                      const isOutgoing = evt.type === "outgoing";
                      const isCompleted = evt.status === "completed";

                      return (
                        <div
                          key={evt.id}
                          className={`group relative flex items-center justify-between w-full text-left p-1 rounded text-[10px] transition-all cursor-pointer font-medium border ${
                            isCompleted
                              ? "bg-zinc-900/80 border-zinc-800 text-zinc-500 line-through"
                              : isIncoming
                              ? "bg-emerald-950/70 border-emerald-800/50 text-emerald-300 hover:bg-emerald-900/80"
                              : isOutgoing
                              ? "bg-blue-950/70 border-blue-800/50 text-blue-300 hover:bg-blue-900/80"
                              : "bg-purple-950/70 border-purple-800/50 text-purple-300 hover:bg-purple-900/80"
                          }`}
                          title={`${evt.title} - $${evt.amount.toFixed(2)} (${evt.status})`}
                        >
                          <button
                            type="button"
                            onClick={() => onEventClick?.(evt.title)}
                            className="flex-1 text-left truncate flex items-center gap-1 cursor-pointer"
                          >
                            <span className="font-bold shrink-0">
                              {evt.amount > 0 ? `$${evt.amount.toFixed(0)} ` : ""}
                            </span>
                            <span className="truncate">{evt.title}</span>
                          </button>

                          {/* Quick Actions (Complete & Delete) */}
                          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1">
                            {onToggleStatus && (
                              <button
                                type="button"
                                title={isCompleted ? "Mark as Scheduled" : "Mark as Completed"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleStatus(evt.id, isCompleted ? "scheduled" : "completed");
                                }}
                                className="p-0.5 text-zinc-400 hover:text-emerald-400 rounded cursor-pointer"
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Circle className="w-3 h-3" />
                                )}
                              </button>
                            )}
                            {onDeleteEvent && (
                              <button
                                type="button"
                                title="Delete Scheduled Item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteEvent(evt.id);
                                }}
                                className="p-0.5 text-zinc-400 hover:text-rose-400 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
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
                const isCompleted = evt.status === "completed";

                return (
                  <div
                    key={evt.id}
                    onClick={() => onEventClick?.(evt.title)}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all cursor-pointer gap-2 ${
                      isCompleted
                        ? "bg-zinc-950/60 border-zinc-800/60 opacity-60"
                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          isCompleted
                            ? "bg-zinc-800/40 border-zinc-700 text-zinc-500"
                            : isIncoming
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
                        <p
                          className={`text-xs font-semibold flex items-center gap-2 ${
                            isCompleted ? "text-zinc-400 line-through" : "text-zinc-100"
                          }`}
                        >
                          {evt.title}
                          <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                            {evt.category}
                          </span>
                          {isCompleted && (
                            <span className="text-[9px] font-semibold text-emerald-400 uppercase">
                              Completed
                            </span>
                          )}
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
                            isCompleted
                              ? "text-zinc-500"
                              : isIncoming
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

                      <div className="flex items-center gap-1.5">
                        {onToggleStatus && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleStatus(evt.id, isCompleted ? "scheduled" : "completed");
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                              isCompleted
                                ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 hover:bg-emerald-900"
                                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                            }`}
                          >
                            {isCompleted ? "Reopen" : "Mark Paid"}
                          </button>
                        )}
                        {onDeleteEvent && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteEvent(evt.id);
                            }}
                            title="Delete Event"
                            className="p-1.5 rounded bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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
