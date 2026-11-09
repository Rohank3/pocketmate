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
  AlertCircle,
  Check,
} from "lucide-react";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";
import {
  extractLifecycle,
  formatCounterpartyWithLifecycle,
  isEventActiveOnDate,
  cancelSubscriptionCounterparty,
} from "@/lib/utils/subscriptionLifecycle";

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
  startDate?: string;
  endDate?: string;
}

export interface BudgetSchedulerProps {
  categories?: CategoryItem[];
  selectedCategory?: string;
  events?: ScheduledEvent[];
  onEventClick?: (eventName: string) => void;
  onAddEvent?: (event: Omit<ScheduledEvent, "id">) => void;
  onDeleteEvent?: (eventId: string) => void;
  onToggleStatus?: (eventId: string, newStatus: "pending" | "scheduled" | "completed") => void;
  onCancelSubscription?: (eventId: string, updatedCounterparty: string) => void;
}

export default function BudgetScheduler({
  categories = [],
  events: propEvents,
  onAddEvent,
  onDeleteEvent,
  onToggleStatus,
  onCancelSubscription,
}: BudgetSchedulerProps) {
  const [viewMode, setViewMode] = useState<"calendar" | "agenda">("calendar");
  const [internalEvents, setInternalEvents] = useState<ScheduledEvent[]>([]);
  const [calendarCategory, setCalendarCategory] = useState<string>("all");
  const events = propEvents !== undefined ? propEvents : internalEvents;
  const setEvents = (updater: React.SetStateAction<ScheduledEvent[]>) => {
    setInternalEvents(updater);
  };

  // Dynamic Month & Year Navigation State
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth(); // 0-indexed

  const MONTH_NAMES = useMemo(
    () => [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    []
  );

  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = viewYear - 3; y <= viewYear + 4; y++) {
      years.push(y);
    }
    return years;
  }, [viewYear]);

  const handleSelectMonth = (mIndex: number) => {
    setViewDate(new Date(viewYear, mIndex, 1));
  };

  const handleSelectYear = (yr: number) => {
    setViewDate(new Date(yr, viewMonth, 1));
  };

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

  // Selected Day Details Modal (Dual-Pane)
  const [selectedDayModal, setSelectedDayModal] = useState<{
    dateStr: string; // "YYYY-MM-DD"
    dayNumber: number;
    formattedTitle: string; // e.g. "Wednesday, November 18, 2026"
  } | null>(null);

  // Form state for creating an event inside Day Modal or standalone
  const [modalTitle, setModalTitle] = useState("");
  const [modalAmount, setModalAmount] = useState("50");
  const [modalType, setModalType] = useState<"incoming" | "outgoing" | "milestone">("outgoing");
  const [modalCategory, setModalCategory] = useState("Dining");
  const [modalCounterparty, setModalCounterparty] = useState("");
  const [modalStartDate, setModalStartDate] = useState("");
  const [modalEndDate, setModalEndDate] = useState("");

  const handlePrevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handleJumpToToday = () => {
    setViewDate(new Date());
  };

  // Open the Day Details popup for a specific date
  const handleOpenDayModal = (dateStr: string, dayNumber: number) => {
    let resolvedDateStr = dateStr;
    if (!resolvedDateStr || resolvedDateStr.split("-").length < 3) {
      resolvedDateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    }
    // Parse date parts safely to avoid timezone drift
    const [y, m, d] = resolvedDateStr.split("-").map(Number);
    const parsedDate = new Date(y, m - 1, d);
    const formatted = parsedDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    setSelectedDayModal({
      dateStr: resolvedDateStr,
      dayNumber,
      formattedTitle: formatted,
    });
    setModalTitle("");
    setModalAmount("50");
    setModalType("outgoing");
    setModalCategory(categories[0]?.name || "Utilities");
    setModalCounterparty("");
    setModalStartDate(resolvedDateStr);
    setModalEndDate("");
  };

  // Filtered events (decoupled from global ledger selection so all subscriptions are visible by default)
  const displayedEvents = useMemo(() => {
    return events.filter((e) => {
      const matchType = filterType === "all" || e.type === filterType;
      const matchCat =
        calendarCategory.toLowerCase() === "all" ||
        e.category.toLowerCase() === calendarCategory.toLowerCase();
      return matchType && matchCat;
    });
  }, [events, filterType, calendarCategory]);

  // Current date string for strict future completion prevention
  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Helper to determine if a scheduled item belongs to a calendar day
  const doesEventMatchDay = (e: ScheduledEvent, cellDateStr: string, cellDay: number) => {
    return isEventActiveOnDate(e, cellDateStr, cellDay, "monthly");
  };

  // Aggregate metrics for currently viewed month (independent of sub-filter tabs)
  const currentMonthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const daysInCurrentMonth = useMemo(() => new Date(viewYear, viewMonth + 1, 0).getDate(), [viewYear, viewMonth]);

  const monthEvents = useMemo(() => {
    return events.filter((e) => {
      const midDateStr = `${currentMonthPrefix}-${String(Math.min(e.dayOfMonth || 15, daysInCurrentMonth)).padStart(2, "0")}`;
      return isEventActiveOnDate(e, midDateStr, e.dayOfMonth || 15, "monthly");
    });
  }, [events, currentMonthPrefix, daysInCurrentMonth]);

  const upcomingBills = useMemo(() => {
    return monthEvents
      .filter((e) => {
        if (e.type !== "outgoing") return false;
        const dayOfMonth = e.dayOfMonth || (e.date ? parseInt(e.date.slice(8, 10)) : 15);
        const isCurrentMonthViewed =
          new Date().getFullYear() === viewYear && new Date().getMonth() === viewMonth;
        const isFutureDay = isCurrentMonthViewed && dayOfMonth > new Date().getDate();
        if (isFutureDay) return true;
        return e.status !== "completed";
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [monthEvents, viewYear, viewMonth]);

  const upcomingReceivables = useMemo(() => {
    return monthEvents
      .filter((e) => e.type === "incoming" && e.status !== "completed")
      .reduce((sum, e) => sum + e.amount, 0);
  }, [monthEvents]);

  // Calendar generation with dynamic day-of-week alignment and padding
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun..6 = Sat
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
        events: displayedEvents.filter((e) => doesEventMatchDay(e, dateStr, day)),
      });
    }

    // Days in current month
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const dateStr = `${currentMonthPrefix}-${String(day).padStart(2, "0")}`;
      const dayEvents = displayedEvents.filter((e) => doesEventMatchDay(e, dateStr, day));
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
        events: displayedEvents.filter((e) => doesEventMatchDay(e, dateStr, day)),
      });
    }

    return cells;
  }, [viewYear, viewMonth, currentMonthPrefix, daysInCurrentMonth, displayedEvents]);

  // Handle adding event from the day details modal
  const handleCreateEventForDay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDayModal || !modalTitle.trim()) return;

    const amt = Math.max(0, parseFloat(modalAmount) || 0);

    const formattedCp = formatCounterpartyWithLifecycle(
      modalCounterparty,
      modalStartDate || selectedDayModal.dateStr,
      modalEndDate
    );

    const created: ScheduledEvent = {
      id: `evt_${Date.now()}`,
      title: modalTitle.trim(),
      amount: amt,
      date: selectedDayModal.dateStr,
      dayOfMonth: selectedDayModal.dayNumber,
      type: modalType,
      category: modalCategory,
      counterparty: formattedCp || undefined,
      startDate: modalStartDate || selectedDayModal.dateStr,
      endDate: modalEndDate || undefined,
      status: "scheduled",
    };

    setEvents((prev) => [...prev, created]);
    onAddEvent?.(created);
    setModalTitle("");
    setModalAmount("50");
    setModalCounterparty("");
    setModalEndDate("");
  };

  // Handle cancelling a recurring subscription from the Day Details modal
  const handleCancelSubscriptionAction = async (eventId: string, currentCounterparty?: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const updatedCp = cancelSubscriptionCounterparty(currentCounterparty, today);

    if (onCancelSubscription) {
      onCancelSubscription(eventId, updatedCp);
    } else {
      try {
        await fetch("/api/events", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: eventId, counterparty: updatedCp, status: "completed" }),
        });
      } catch (err) {
        console.error(err);
      }
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? { ...e, counterparty: updatedCp, status: "completed" }
            : e
        )
      );
    }
  };

  // Selected day items for modal
  const selectedDayEvents = useMemo(() => {
    if (!selectedDayModal) return [];
    return events.filter((e) =>
      doesEventMatchDay(e, selectedDayModal.dateStr, selectedDayModal.dayNumber)
    );
  }, [events, selectedDayModal]);

  const selectedDayTotalBills = useMemo(() => {
    return selectedDayEvents
      .filter((e) => e.type === "outgoing" && e.status !== "completed")
      .reduce((sum, e) => sum + e.amount, 0);
  }, [selectedDayEvents]);

  const selectedDayTotalReceivables = useMemo(() => {
    return selectedDayEvents
      .filter((e) => e.type === "incoming" && e.status !== "completed")
      .reduce((sum, e) => sum + e.amount, 0);
  }, [selectedDayEvents]);

  return (
    <div className="h-full w-full flex flex-col glass-panel rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Header & Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-zinc-950/70 border-b border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-100">
                Upcoming & Due Calendar
              </h2>
              {/* Dynamic Month Navigation Controls with Direct Month/Year Dropdowns */}
              <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  title="Previous Month"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Direct Month Selector Dropdown */}
                <select
                  aria-label="Select Calendar Month"
                  value={viewMonth}
                  onChange={(e) => handleSelectMonth(Number(e.target.value))}
                  className="bg-zinc-950 text-[11px] font-semibold text-purple-300 hover:text-purple-200 focus:outline-none cursor-pointer px-1 py-0.5 rounded border border-transparent hover:border-zinc-800 transition-colors"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx} className="bg-zinc-900 text-zinc-200">
                      {name}
                    </option>
                  ))}
                </select>

                {/* Direct Year Selector Dropdown */}
                <select
                  aria-label="Select Calendar Year"
                  value={viewYear}
                  onChange={(e) => handleSelectYear(Number(e.target.value))}
                  className="bg-zinc-950 text-[11px] font-semibold text-purple-300 hover:text-purple-200 focus:outline-none cursor-pointer px-1 py-0.5 rounded border border-transparent hover:border-zinc-800 transition-colors"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr} className="bg-zinc-900 text-zinc-200">
                      {yr}
                    </option>
                  ))}
                </select>

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
              Click any day to inspect bills, mark as done, or schedule reminders
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

          {/* Quick Schedule Today Button */}
          <button
            onClick={() => {
              const y = viewDate.getFullYear();
              const m = String(viewDate.getMonth() + 1).padStart(2, "0");
              const d = String(Math.min(15, new Date(y, viewDate.getMonth() + 1, 0).getDate())).padStart(2, "0");
              handleOpenDayModal(`${y}-${m}-${d}`, parseInt(d, 10));
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

        {/* Directional Type Filters & In-Calendar Category Filter */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
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

          {/* In-Calendar Category Dropdown */}
          <select
            value={calendarCategory}
            onChange={(e) => setCalendarCategory(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 rounded-md px-2 py-1 font-medium focus:outline-none focus:border-zinc-700 cursor-pointer ml-1"
            aria-label="Filter calendar events by category"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id || c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {calendarCategory !== "all" && (
            <button
              onClick={() => setCalendarCategory("all")}
              className="text-[10px] text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer"
            >
              Reset
            </button>
          )}
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
                  onClick={() => handleOpenDayModal(cell.dateStr, cell.day)}
                  className={`min-h-[85px] sm:min-h-[95px] p-1.5 rounded-lg border transition-all flex flex-col justify-between cursor-pointer group ${
                    cell.isToday
                      ? "bg-zinc-900/90 border-blue-500/60 shadow-xs shadow-blue-500/10 hover:border-blue-400"
                      : cell.isCurrentMonth
                      ? "bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/40"
                      : "bg-zinc-950/40 border-zinc-900 text-zinc-600 opacity-60 hover:opacity-80"
                  }`}
                  title={`Click to view or add bills for ${cell.dateStr}`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                        cell.isToday
                          ? "bg-blue-600 text-white"
                          : cell.isCurrentMonth
                          ? "text-zinc-400 group-hover:text-zinc-200"
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
                      const isCompleted = evt.status === "completed" && cell.dateStr <= todayDateStr;

                      return (
                        <div
                          key={evt.id}
                          className={`flex items-center justify-between w-full text-left p-1 rounded text-[10px] transition-all font-medium border ${
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
                          <span className="truncate flex items-center gap-1">
                            <span className="font-bold shrink-0">
                              {evt.amount > 0 ? `$${evt.amount.toFixed(0)} ` : ""}
                            </span>
                            <span className="truncate">{evt.title}</span>
                          </span>

                          {/* Quick Actions (Complete & Delete) right on hover */}
                          <div className="flex items-center gap-0.5 shrink-0 ml-1">
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
              Upcoming financial milestones ordered chronologically. Click any item to inspect details or manage status.
            </p>

            <div className="flex flex-col gap-2.5">
              {displayedEvents.map((evt) => {
                const isIncoming = evt.type === "incoming";
                const isOutgoing = evt.type === "outgoing";
                const isCompleted = evt.status === "completed";

                return (
                  <div
                    key={evt.id}
                    onClick={() => {
                      const day = evt.date ? parseInt(evt.date.split("-")[2], 10) : evt.dayOfMonth || 15;
                      const dateStr = evt.date || `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      handleOpenDayModal(dateStr, day);
                    }}
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
                        {(() => {
                          const lifecycle = extractLifecycle(evt.counterparty, evt.date);
                          return (
                            <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {lifecycle.cleanName && (
                                <span>Provider: <span className="text-zinc-300">{lifecycle.cleanName}</span> ·</span>
                              )}
                              <span>Due: <span className="text-zinc-300 font-mono">{evt.date}</span></span>
                              {evt.type === "outgoing" && (
                                <>
                                  <span>·</span>
                                  <span
                                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                      lifecycle.isOngoing
                                        ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                                        : "bg-amber-950/60 text-amber-400 border border-amber-800/40"
                                    }`}
                                  >
                                    {lifecycle.contractStatus}
                                  </span>
                                </>
                              )}
                            </div>
                          );
                        })()}
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
          Click any day to inspect summary, mark items done, or set reminders
        </span>
      </div>

      {/* Dual-Pane Day Details & Scheduling Popup Modal */}
      {selectedDayModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
                    {selectedDayModal.formattedTitle}
                  </h3>
                  <div className="flex items-center gap-3 text-xs mt-0.5 font-mono">
                    <span className="text-rose-400">Bills Due: -${selectedDayTotalBills.toFixed(2)}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-emerald-400">Receivables: +${selectedDayTotalReceivables.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDayModal(null)}
                className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Dual Pane Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-y-auto divide-y md:divide-y-0 md:divide-x divide-zinc-800">
              {/* Left Pane (7 cols): List of Bills / Reminders for this Day */}
              <div className="md:col-span-7 p-4 sm:p-5 flex flex-col gap-3 overflow-y-auto">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800/80">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Scheduled for this Day</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400">
                      {selectedDayEvents.length}
                    </span>
                  </h4>
                </div>

                {selectedDayEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-950/40 rounded-xl border border-dashed border-zinc-800 flex-1 min-h-[160px]">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800/50 flex items-center justify-center text-zinc-500 mb-2">
                      <Clock className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-medium text-zinc-300">No items scheduled for this day</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5 max-w-xs">
                      Use the quick-set form to add a bill, receivable, or checkpoint for this date.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {selectedDayEvents.map((evt) => {
                      const isIncoming = evt.type === "incoming";
                      const isOutgoing = evt.type === "outgoing";
                      const isCompleted = evt.status === "completed" && (selectedDayModal ? selectedDayModal.dateStr <= todayDateStr : true);
                      const lifecycle = extractLifecycle(evt.counterparty, evt.date);

                      return (
                        <div
                          key={evt.id}
                          className={`p-3 rounded-xl border transition-all flex flex-col gap-2 ${
                            isCompleted
                              ? "bg-zinc-950/40 border-zinc-800/50 opacity-60"
                              : "bg-zinc-950/90 border-zinc-800 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
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
                                  className={`text-xs font-semibold ${
                                    isCompleted ? "text-zinc-400 line-through" : "text-zinc-100"
                                  }`}
                                >
                                  {evt.title}
                                </p>
                                <div className="flex flex-col gap-1 mt-0.5 text-[11px] text-zinc-400">
                                  <div className="flex items-center gap-2">
                                    <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                                      {evt.category}
                                    </span>
                                    {lifecycle.cleanName && (
                                      <span>Provider: <span className="text-zinc-300">{lifecycle.cleanName}</span></span>
                                    )}
                                  </div>
                                  {evt.type === "outgoing" && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                      {lifecycle.startDate && (
                                        <span>Started: <span className="text-zinc-300 font-mono">{lifecycle.startDate}</span></span>
                                      )}
                                      <span>·</span>
                                      <span
                                        className={
                                          lifecycle.isCancelled
                                            ? "text-rose-400 font-medium"
                                            : lifecycle.isOngoing
                                            ? "text-emerald-400/90"
                                            : "text-amber-400/90 font-medium"
                                        }
                                      >
                                        {lifecycle.contractStatus}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span
                                className={`text-sm font-bold font-mono block ${
                                  isCompleted
                                    ? "text-zinc-500 line-through"
                                    : isIncoming
                                    ? "text-emerald-400"
                                    : isOutgoing
                                    ? "text-rose-400"
                                    : "text-purple-400"
                                }`}
                              >
                                {evt.amount > 0 ? `${isIncoming ? "+" : "-"}$${evt.amount.toFixed(2)}` : "Milestone"}
                              </span>
                              <span
                                className={`text-[9px] uppercase font-semibold ${
                                  isCompleted
                                    ? "text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40"
                                    : isIncoming
                                    ? "text-emerald-400/80"
                                    : "text-zinc-500"
                                }`}
                              >
                                {isCompleted ? "✓ Paid / Settled" : evt.type}
                              </span>
                            </div>
                          </div>

                          {/* Action Row */}
                          <div className="flex items-center justify-between pt-2 border-t border-zinc-850/80 text-xs">
                            <span className="text-[10px] text-zinc-500">
                              Status: <span className="text-zinc-300 capitalize">{evt.status}</span>
                            </span>

                            <div className="flex items-center gap-2">
                              {onToggleStatus && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onToggleStatus(evt.id, isCompleted ? "scheduled" : "completed")
                                  }
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                                    isCompleted
                                      ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                                  }`}
                                >
                                  {isCompleted ? (
                                    <span>Reopen</span>
                                  ) : (
                                    <>
                                      <Check className="w-3 h-3" />
                                      <span>Mark Done</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {onDeleteEvent && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteEvent(evt.id)}
                                  className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 border border-zinc-800 transition-colors cursor-pointer text-xs"
                                  title="Delete item"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              )}

                              {evt.type === "outgoing" && !lifecycle.isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelSubscriptionAction(evt.id, evt.counterparty)}
                                  className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-rose-950/70 text-zinc-400 hover:text-rose-400 border border-zinc-800 transition-colors cursor-pointer text-xs"
                                  title="Cancel subscription (preserves past history, removes from future months)"
                                >
                                  <span>Cancel</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Pane (5 cols): Inline Form to Set Bill or Reminder for this Date */}
              <div className="md:col-span-5 p-4 sm:p-5 bg-zinc-950/60 flex flex-col justify-between">
                <div>
                  <div className="pb-1 mb-3 border-b border-zinc-800/80">
                    <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-blue-400" />
                      <span>Set Reminder for this Day</span>
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Date locked: <span className="text-zinc-300 font-mono">{selectedDayModal.dateStr}</span>
                    </p>
                  </div>

                  <form onSubmit={handleCreateEventForDay} className="flex flex-col gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                        Bill / Reminder Title
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. WiFi Bill, Client Retainer, Split"
                        value={modalTitle}
                        onChange={(e) => setModalTitle(e.target.value)}
                        required
                        className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                          Amount ($)
                        </label>
                        <div className="relative">
                          <DollarSign className="w-3.5 h-3.5 absolute left-2 top-2 text-zinc-500" />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={modalAmount}
                            onChange={(e) => setModalAmount(e.target.value)}
                            required
                            className="w-full pl-6 pr-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                          Type
                        </label>
                        <select
                          value={modalType}
                          onChange={(e) => setModalType(e.target.value as "incoming" | "outgoing" | "milestone")}
                          className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-100 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                        >
                          <option value="outgoing">Bill Due</option>
                          <option value="incoming">Receivable</option>
                          <option value="milestone">Checkpoint</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                        Category
                      </label>
                      <select
                        value={modalCategory}
                        onChange={(e) => setModalCategory(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-100 focus:outline-hidden focus:border-blue-500 cursor-pointer"
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

                    <div>
                      <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                        Counterparty / Merchant (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Netflix, Alex, Landlord"
                        value={modalCounterparty}
                        onChange={(e) => setModalCounterparty(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-blue-500"
                      />
                    </div>

                    {/* Subscription & Contract Lifecycle Fields */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                          Start Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={modalStartDate}
                          onChange={(e) => setModalStartDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                          End Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={modalEndDate}
                          onChange={(e) => setModalEndDate(e.target.value)}
                          placeholder="Ongoing"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Quick Duration Preset Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap -mt-1">
                      <span className="text-[10px] text-zinc-400">Duration:</span>
                      <button
                        type="button"
                        onClick={() => setModalEndDate("")}
                        className={`text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors border ${
                          !modalEndDate
                            ? "bg-blue-600 text-white border-blue-500 font-semibold"
                            : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                        }`}
                      >
                        Ongoing (12 Mo)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const base = new Date(modalStartDate || selectedDayModal.dateStr);
                          base.setMonth(base.getMonth() + 6);
                          setModalEndDate(base.toISOString().slice(0, 10));
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200 cursor-pointer transition-colors"
                      >
                        6 Months
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const base = new Date(modalStartDate || selectedDayModal.dateStr);
                          base.setFullYear(base.getFullYear() + 1);
                          setModalEndDate(base.toISOString().slice(0, 10));
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200 cursor-pointer transition-colors"
                      >
                        1 Year
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const base = new Date(modalStartDate || selectedDayModal.dateStr);
                          base.setFullYear(base.getFullYear() + 3);
                          setModalEndDate(base.toISOString().slice(0, 10));
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200 cursor-pointer transition-colors"
                        title="E.g. Spotify Student 3-Year Plan"
                      >
                        3 Years (Student)
                      </button>
                    </div>

                    <p className="text-[10px] text-zinc-500">
                      Ongoing subscriptions project up to 12 months ahead until cancelled. Fixed contracts (e.g. 3-Year Spotify Student) project strictly until their End Date.
                    </p>

                    <button
                      type="submit"
                      className="mt-2 w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-md transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to this Day</span>
                    </button>
                  </form>
                </div>

                <div className="pt-3 mt-4 border-t border-zinc-800/80 text-[10px] text-zinc-500 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                  <span>Items saved here update your calendar and cashflow projections in real time.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
