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
    <div className="h-full w-full flex flex-col bg-white/95 border border-stone-200/90 rounded-2xl overflow-hidden shadow-sm relative">
      {/* Prominent Liquid Flow Animation */}
      <div className="absolute top-0 left-0 right-0 z-10 liquid-bar" />

      {/* Top Header & Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-stone-50/90 border-b border-stone-200 mt-[3.5px]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-300 flex items-center justify-center text-amber-800 shadow-2xs">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-900">
                Upcoming & Due Calendar
              </h2>
              {/* Dynamic Month Navigation Controls with Direct Month/Year Dropdowns */}
              <div className="flex items-center bg-white border border-stone-200 rounded-lg p-0.5 gap-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  title="Previous Month"
                  className="p-1 rounded text-stone-500 hover:text-zinc-900 hover:bg-stone-100 cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Direct Month Selector Dropdown */}
                <select
                  aria-label="Select Calendar Month"
                  value={viewMonth}
                  onChange={(e) => handleSelectMonth(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-semibold text-amber-900 hover:text-amber-950 focus:outline-none cursor-pointer px-1 py-0.5 rounded border border-transparent hover:border-stone-200 transition-colors"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx} className="bg-white text-zinc-900">
                      {name}
                    </option>
                  ))}
                </select>

                {/* Direct Year Selector Dropdown */}
                <select
                  aria-label="Select Calendar Year"
                  value={viewYear}
                  onChange={(e) => handleSelectYear(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-semibold text-amber-900 hover:text-amber-950 focus:outline-none cursor-pointer px-1 py-0.5 rounded border border-transparent hover:border-stone-200 transition-colors"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr} className="bg-white text-zinc-900">
                      {yr}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  title="Next Month"
                  className="p-1 rounded text-stone-500 hover:text-zinc-900 hover:bg-stone-100 cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleJumpToToday}
                  title="Jump to Current Month"
                  className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 hover:bg-stone-200 cursor-pointer transition-colors ml-0.5"
                >
                  Today
                </button>
              </div>
            </div>
            <p className="text-xs text-stone-500">
              Click any day to inspect bills, mark as done, or schedule reminders
            </p>
          </div>
        </div>

        {/* Cashflow Summary & Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 text-xs font-mono bg-white px-3 py-1.5 rounded-lg border border-stone-200 shadow-2xs">
            <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Receivables: +${upcomingReceivables.toFixed(2)}</span>
            </div>
            <div className="w-px h-3 bg-stone-200" />
            <div className="flex items-center gap-1.5 text-rose-600 font-semibold">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-zinc-950 text-xs font-bold cursor-pointer shadow-xs border border-amber-400/40 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bill / Reminder</span>
          </button>
        </div>
      </div>

      {/* View Switcher & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2 bg-stone-50/60 border-b border-stone-200 text-xs">
        {/* Calendar vs Agenda Tabs */}
        <div className="flex items-center bg-white border border-stone-200 p-0.5 rounded-xl shadow-2xs">
          <button
            onClick={() => setViewMode("calendar")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              viewMode === "calendar"
                ? "bg-amber-500/15 text-amber-900 border border-amber-300 font-semibold shadow-2xs"
                : "text-stone-600 hover:text-zinc-900"
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Month Grid</span>
          </button>

          <button
            onClick={() => setViewMode("agenda")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              viewMode === "agenda"
                ? "bg-amber-500/15 text-amber-900 border border-amber-300 font-semibold shadow-2xs"
                : "text-stone-600 hover:text-zinc-900"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Timeline Agenda</span>
          </button>
        </div>

        {/* Directional Type Filters & In-Calendar Category Filter */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-stone-400 text-[11px] hidden sm:inline">Filter:</span>
          <button
            onClick={() => setFilterType("all")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
              filterType === "all"
                ? "bg-stone-200 text-zinc-900 border-stone-300 font-semibold"
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
            }`}
          >
            All Items ({events.length})
          </button>

          <button
            onClick={() => setFilterType("incoming")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
              filterType === "incoming"
                ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold"
                : "bg-white text-stone-600 border-stone-200 hover:text-emerald-700"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Receivables (Money In)
          </button>

          <button
            onClick={() => setFilterType("outgoing")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
              filterType === "outgoing"
                ? "bg-amber-50 text-amber-900 border-amber-300 font-semibold"
                : "bg-white text-stone-600 border-stone-200 hover:text-amber-800"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Bills (Money Out)
          </button>

          {/* In-Calendar Category Dropdown */}
          <select
            value={calendarCategory}
            onChange={(e) => setCalendarCategory(e.target.value)}
            className="bg-white border border-stone-200 text-[11px] text-stone-700 rounded-lg px-2.5 py-1 font-medium focus:outline-none focus:border-amber-400 cursor-pointer ml-1 shadow-2xs"
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
              className="text-[10px] text-amber-800 hover:text-amber-900 underline font-semibold cursor-pointer"
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
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-stone-500 pb-2 border-b border-stone-200">
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
                  className={`min-h-[85px] sm:min-h-[95px] p-1.5 rounded-xl border transition-all flex flex-col justify-between cursor-pointer group shadow-2xs ${
                    cell.isToday
                      ? "bg-amber-50/50 border-amber-400 shadow-xs hover:border-amber-500"
                      : cell.isCurrentMonth
                      ? "bg-white border-stone-200 hover:border-amber-300 hover:bg-stone-50/60"
                      : "bg-stone-50/40 border-stone-100 text-stone-400 opacity-60 hover:opacity-80"
                  }`}
                  title={`Click to view or add bills for ${cell.dateStr}`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                        cell.isToday
                          ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-zinc-950 font-bold shadow-xs"
                          : cell.isCurrentMonth
                          ? "text-stone-700 group-hover:text-zinc-900"
                          : "text-stone-400"
                      }`}
                    >
                      {cell.day}
                    </span>
                    {cell.isToday && (
                      <span className="text-[9px] font-bold text-amber-800 uppercase tracking-tight">
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
                          className={`flex items-center justify-between w-full text-left p-1 rounded-md text-[10px] transition-all font-medium border shadow-2xs ${
                            isCompleted
                              ? "bg-stone-100 border-stone-200 text-stone-400 line-through"
                              : isIncoming
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                              : isOutgoing
                              ? "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100"
                              : "bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100"
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
                                className="p-0.5 text-stone-400 hover:text-emerald-600 rounded cursor-pointer"
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
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
                                className="p-0.5 text-stone-400 hover:text-rose-600 rounded cursor-pointer"
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
            <p className="text-xs text-stone-500 mb-1">
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
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all cursor-pointer gap-2 shadow-2xs ${
                      isCompleted
                        ? "bg-stone-50 border-stone-200 opacity-60"
                        : "bg-white border-stone-200 hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          isCompleted
                            ? "bg-stone-100 border-stone-200 text-stone-400"
                            : isIncoming
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : isOutgoing
                            ? "bg-amber-50 border-amber-200 text-amber-800"
                            : "bg-purple-50 border-purple-200 text-purple-700"
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
                            isCompleted ? "text-stone-400 line-through" : "text-zinc-900"
                          }`}
                        >
                          {evt.title}
                          <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 border border-stone-200">
                            {evt.category}
                          </span>
                          {isCompleted && (
                            <span className="text-[9px] font-semibold text-emerald-700 uppercase">
                              Completed
                            </span>
                          )}
                        </p>
                        {(() => {
                          const lifecycle = extractLifecycle(evt.counterparty, evt.date);
                          return (
                            <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {lifecycle.cleanName && (
                                <span>Provider: <span className="text-zinc-800 font-medium">{lifecycle.cleanName}</span> ·</span>
                              )}
                              <span>Due: <span className="text-zinc-800 font-mono font-medium">{evt.date}</span></span>
                              {evt.type === "outgoing" && (
                                <>
                                  <span>·</span>
                                  <span
                                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                      lifecycle.isOngoing
                                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                        : "bg-amber-50 text-amber-900 border border-amber-200"
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

                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-stone-100">
                      <div className="text-right">
                        <span
                          className={`text-sm font-bold font-mono block ${
                            isCompleted
                              ? "text-stone-400"
                              : isIncoming
                              ? "text-emerald-700"
                              : isOutgoing
                              ? "text-zinc-900"
                              : "text-purple-700"
                          }`}
                        >
                          {evt.amount > 0 ? `${isIncoming ? "+" : "-"}$${evt.amount.toFixed(2)}` : "Milestone"}
                        </span>
                        <span className="text-[10px] text-stone-400 uppercase font-medium">
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
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-2xs ${
                              isCompleted
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                                : "bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300"
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
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-400 hover:text-rose-600 border border-stone-200 transition-colors cursor-pointer"
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
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-stone-50 border-t border-stone-200 text-[11px] text-stone-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Receivables (Split Due)
          </span>
          <span className="flex items-center gap-1 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Subscriptions & Bills
          </span>
          <span className="flex items-center gap-1 font-medium">
            <span className="w-2 h-2 rounded-full bg-purple-500" /> Checkpoints
          </span>
        </div>
        <span className="text-stone-400 text-[10px]">
          Click any day to inspect summary, mark items done, or set reminders
        </span>
      </div>

      {/* Dual-Pane Day Details & Scheduling Popup Modal */}
      {selectedDayModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white border border-amber-300/80 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] relative">
            {/* Prominent Liquid Flow Animation */}
            <div className="absolute top-0 left-0 right-0 z-10 liquid-bar" />

            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-amber-50/60 mt-[3.5px]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-300 flex items-center justify-center text-amber-800 shadow-2xs">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-zinc-900 flex items-center gap-2">
                    {selectedDayModal.formattedTitle}
                  </h3>
                  <div className="flex items-center gap-3 text-xs mt-0.5 font-mono">
                    <span className="text-rose-600 font-semibold">Bills Due: -${selectedDayTotalBills.toFixed(2)}</span>
                    <span className="text-stone-300">·</span>
                    <span className="text-emerald-700 font-semibold">Receivables: +${selectedDayTotalReceivables.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDayModal(null)}
                className="text-stone-400 hover:text-zinc-900 p-1.5 rounded-lg hover:bg-stone-100 cursor-pointer transition-colors"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Dual Pane Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-y-auto divide-y md:divide-y-0 md:divide-x divide-stone-200">
              {/* Left Pane (7 cols): List of Bills / Reminders for this Day */}
              <div className="md:col-span-7 p-4 sm:p-5 flex flex-col gap-3 overflow-y-auto bg-white">
                <div className="flex items-center justify-between pb-1 border-b border-stone-200">
                  <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Scheduled for this Day</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-700 border border-stone-200 font-mono font-medium">
                      {selectedDayEvents.length}
                    </span>
                  </h4>
                </div>

                {selectedDayEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200 flex-1 min-h-[160px]">
                    <div className="w-10 h-10 rounded-xl bg-stone-200/60 flex items-center justify-center text-stone-500 mb-2">
                      <Clock className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-zinc-800">No items scheduled for this day</p>
                    <p className="text-[11px] text-stone-500 mt-0.5 max-w-xs">
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
                          className={`p-3 rounded-xl border transition-all flex flex-col gap-2 shadow-2xs ${
                            isCompleted
                              ? "bg-stone-50 border-stone-200 opacity-60"
                              : "bg-white border-stone-200 hover:border-amber-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                                  isCompleted
                                    ? "bg-stone-100 border-stone-200 text-stone-400"
                                    : isIncoming
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : isOutgoing
                                    ? "bg-amber-50 border-amber-200 text-amber-800"
                                    : "bg-purple-50 border-purple-200 text-purple-700"
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
                                    isCompleted ? "text-stone-400 line-through" : "text-zinc-900"
                                  }`}
                                >
                                  {evt.title}
                                </p>
                                <div className="flex flex-col gap-1 mt-0.5 text-[11px] text-stone-500">
                                  <div className="flex items-center gap-2">
                                    <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 border border-stone-200 text-[10px]">
                                      {evt.category}
                                    </span>
                                    {lifecycle.cleanName && (
                                      <span>Provider: <span className="text-zinc-800 font-medium">{lifecycle.cleanName}</span></span>
                                    )}
                                  </div>
                                  {evt.type === "outgoing" && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-stone-500">
                                      {lifecycle.startDate && (
                                        <span>Started: <span className="text-zinc-800 font-mono font-medium">{lifecycle.startDate}</span></span>
                                      )}
                                      <span>·</span>
                                      <span
                                        className={
                                          lifecycle.isCancelled
                                            ? "text-rose-600 font-medium"
                                            : lifecycle.isOngoing
                                            ? "text-emerald-700"
                                            : "text-amber-800 font-medium"
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
                                    ? "text-stone-400 line-through"
                                    : isIncoming
                                    ? "text-emerald-700"
                                    : isOutgoing
                                    ? "text-rose-600"
                                    : "text-purple-700"
                                }`}
                              >
                                {evt.amount > 0 ? `${isIncoming ? "+" : "-"}$${evt.amount.toFixed(2)}` : "Milestone"}
                              </span>
                              <span
                                className={`text-[9px] uppercase font-semibold ${
                                  isCompleted
                                    ? "text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300"
                                    : isIncoming
                                    ? "text-emerald-700"
                                    : "text-stone-500"
                                }`}
                              >
                                {isCompleted ? "✓ Paid / Settled" : evt.type}
                              </span>
                            </div>
                          </div>

                          {/* Action Row */}
                          <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs">
                            <span className="text-[10px] text-stone-500">
                              Status: <span className="text-zinc-800 font-medium capitalize">{evt.status}</span>
                            </span>

                            <div className="flex items-center gap-2">
                              {onToggleStatus && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onToggleStatus(evt.id, isCompleted ? "scheduled" : "completed")
                                  }
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-2xs ${
                                    isCompleted
                                      ? "bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200"
                                      : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
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
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-500 hover:text-rose-600 border border-stone-200 transition-colors cursor-pointer text-xs"
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
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600 border border-stone-200 transition-colors cursor-pointer text-xs font-medium"
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
              <div className="md:col-span-5 p-4 sm:p-5 bg-stone-50/70 flex flex-col justify-between">
                <div>
                  <div className="pb-1 mb-3 border-b border-stone-200">
                    <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-amber-700" />
                      <span>Set Reminder for this Day</span>
                    </h4>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Date locked: <span className="text-zinc-800 font-mono font-medium">{selectedDayModal.dateStr}</span>
                    </p>
                  </div>

                  <form onSubmit={handleCreateEventForDay} className="flex flex-col gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                        Bill / Reminder Title
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. WiFi Bill, Client Retainer, Split"
                        value={modalTitle}
                        onChange={(e) => setModalTitle(e.target.value)}
                        required
                        className="w-full px-3 py-1.5 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 placeholder:text-stone-400 focus:outline-hidden focus:border-amber-500 shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                          Amount ($)
                        </label>
                        <div className="relative">
                          <DollarSign className="w-3.5 h-3.5 absolute left-2 top-2 text-stone-400" />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={modalAmount}
                            onChange={(e) => setModalAmount(e.target.value)}
                            required
                            className="w-full pl-6 pr-2 py-1.5 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 font-mono focus:outline-hidden focus:border-amber-500 shadow-2xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                          Type
                        </label>
                        <select
                          value={modalType}
                          onChange={(e) => setModalType(e.target.value as "incoming" | "outgoing" | "milestone")}
                          className="w-full px-2 py-1.5 rounded-lg bg-white border border-stone-300 text-[11px] text-zinc-900 focus:outline-hidden focus:border-amber-500 cursor-pointer shadow-2xs"
                        >
                          <option value="outgoing">Bill Due</option>
                          <option value="incoming">Receivable</option>
                          <option value="milestone">Checkpoint</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                        Category
                      </label>
                      <select
                        value={modalCategory}
                        onChange={(e) => setModalCategory(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-[11px] text-zinc-900 focus:outline-hidden focus:border-amber-500 cursor-pointer shadow-2xs"
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
                      <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                        Counterparty / Merchant (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Netflix, Alex, Landlord"
                        value={modalCounterparty}
                        onChange={(e) => setModalCounterparty(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 placeholder:text-stone-400 focus:outline-hidden focus:border-amber-500 shadow-2xs"
                      />
                    </div>

                    {/* Subscription & Contract Lifecycle Fields */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                          Start Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={modalStartDate}
                          onChange={(e) => setModalStartDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 focus:outline-hidden focus:border-amber-500 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-zinc-700 block mb-1">
                          End Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={modalEndDate}
                          onChange={(e) => setModalEndDate(e.target.value)}
                          placeholder="Ongoing"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 focus:outline-hidden focus:border-amber-500 shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Quick Duration Preset Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap -mt-1">
                      <span className="text-[10px] text-stone-500">Duration:</span>
                      <button
                        type="button"
                        onClick={() => setModalEndDate("")}
                        className={`text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors border shadow-2xs ${
                          !modalEndDate
                            ? "bg-amber-500/20 text-amber-950 border-amber-400 font-bold"
                            : "bg-white text-stone-600 border-stone-200 hover:text-zinc-900"
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
                        className="text-[10px] px-2 py-0.5 rounded bg-white text-stone-600 border border-stone-200 hover:text-zinc-900 cursor-pointer transition-colors shadow-2xs"
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
                        className="text-[10px] px-2 py-0.5 rounded bg-white text-stone-600 border border-stone-200 hover:text-zinc-900 cursor-pointer transition-colors shadow-2xs"
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
                        className="text-[10px] px-2 py-0.5 rounded bg-white text-stone-600 border border-stone-200 hover:text-zinc-900 cursor-pointer transition-colors shadow-2xs"
                        title="E.g. Spotify Student 3-Year Plan"
                      >
                        3 Years (Student)
                      </button>
                    </div>

                    <p className="text-[10px] text-stone-500">
                      Ongoing subscriptions project up to 12 months ahead until cancelled. Fixed contracts (e.g. 3-Year Spotify Student) project strictly until their End Date.
                    </p>

                    <button
                      type="submit"
                      className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-zinc-950 text-xs font-bold cursor-pointer shadow-xs border border-amber-400/40 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to this Day</span>
                    </button>
                  </form>
                </div>

                <div className="pt-3 mt-4 border-t border-stone-200 text-[10px] text-stone-500 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
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
