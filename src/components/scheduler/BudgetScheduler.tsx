"use client";

import React, { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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
  Check,
} from "lucide-react";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";
import {
  extractLifecycle,
  formatCounterpartyWithLifecycle,
  isEventActiveOnDate,
  isEventCompletedForDate,
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
  settledMonths?: string[];
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
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

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

  useEffect(() => {
    if (!selectedDayModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedDayModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDayModal]);

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
        const occDay = Math.min(e.dayOfMonth || 15, daysInCurrentMonth);
        const occDateStr = `${currentMonthPrefix}-${String(occDay).padStart(2, "0")}`;
        return !isEventCompletedForDate(e, occDateStr, todayDateStr);
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [monthEvents, currentMonthPrefix, daysInCurrentMonth, todayDateStr]);

  const upcomingReceivables = useMemo(() => {
    return monthEvents
      .filter((e) => {
        if (e.type !== "incoming") return false;
        const occDay = Math.min(e.dayOfMonth || 15, daysInCurrentMonth);
        const occDateStr = `${currentMonthPrefix}-${String(occDay).padStart(2, "0")}`;
        return !isEventCompletedForDate(e, occDateStr, todayDateStr);
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [monthEvents, currentMonthPrefix, daysInCurrentMonth, todayDateStr]);

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
      .filter(
        (e) =>
          e.type === "outgoing" &&
          !isEventCompletedForDate(e, selectedDayModal?.dateStr || todayDateStr, todayDateStr)
      )
      .reduce((sum, e) => sum + e.amount, 0);
  }, [selectedDayEvents, selectedDayModal, todayDateStr]);

  const selectedDayTotalReceivables = useMemo(() => {
    return selectedDayEvents
      .filter(
        (e) =>
          e.type === "incoming" &&
          !isEventCompletedForDate(e, selectedDayModal?.dateStr || todayDateStr, todayDateStr)
      )
      .reduce((sum, e) => sum + e.amount, 0);
  }, [selectedDayEvents, selectedDayModal, todayDateStr]);

  return (
    <div className="h-full w-full flex flex-col glass-panel rounded-2xl overflow-hidden shadow-md relative">
      {/* Prominent Liquid Flow Animation */}
      <div className="absolute top-0 left-0 right-0 z-10 liquid-bar" />

      {/* Top Header & Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] mt-[3px]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] shadow-2xs shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--fg-primary)]">
                Upcoming &amp; Due
              </h2>
              {/* Dynamic Month Navigation Controls with Direct Month/Year Dropdowns */}
              <div className="flex items-center bg-[var(--surface-card)] border border-[var(--border-strong)] rounded-lg p-0.5 gap-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  title="Previous Month"
                  aria-label="Previous Month"
                  className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--accent)] cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Direct Month Selector Dropdown */}
                <select
                  id="calendar-month-select"
                  name="calendarMonth"
                  aria-label="Select Calendar Month"
                  value={viewMonth}
                  onChange={(e) => handleSelectMonth(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-semibold text-[var(--accent-text)] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] cursor-pointer px-1 py-0.5 rounded border border-transparent hover:border-[var(--border-strong)] transition-colors"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option
                      key={name}
                      value={idx}
                      className="bg-[var(--surface-modal)] text-[var(--fg-primary)]"
                    >
                      {name}
                    </option>
                  ))}
                </select>

                {/* Direct Year Selector Dropdown */}
                <select
                  id="calendar-year-select"
                  name="calendarYear"
                  aria-label="Select Calendar Year"
                  value={viewYear}
                  onChange={(e) => handleSelectYear(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-semibold text-[var(--accent-text)] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] cursor-pointer px-1 py-0.5 rounded border border-transparent hover:border-[var(--border-strong)] transition-colors"
                >
                  {availableYears.map((yr) => (
                    <option
                      key={yr}
                      value={yr}
                      className="bg-[var(--surface-modal)] text-[var(--fg-primary)]"
                    >
                      {yr}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  title="Next Month"
                  aria-label="Next Month"
                  className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--accent)] cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleJumpToToday}
                  title="Jump to Current Month"
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg-primary)] active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--accent)] cursor-pointer transition-colors ml-0.5"
                >
                  Today
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Cashflow Summary & Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 text-xs font-mono bg-[var(--surface-card)] px-3 py-1.5 rounded-lg border border-[var(--border-strong)] shadow-2xs tabular-nums">
            <div className="flex items-center gap-1.5 text-[var(--status-success-text)] font-semibold">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>+${upcomingReceivables.toFixed(2)}</span>
            </div>
            <div className="w-px h-3 bg-[var(--border-subtle)]" />
            <div className="flex items-center gap-1.5 text-[var(--status-danger-text)] font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>-${upcomingBills.toFixed(2)}</span>
            </div>
          </div>

          {/* Quick Schedule Today Button */}
          <button
            type="button"
            onClick={() => {
              const y = viewDate.getFullYear();
              const m = String(viewDate.getMonth() + 1).padStart(2, "0");
              const d = String(Math.min(15, new Date(y, viewDate.getMonth() + 1, 0).getDate())).padStart(2, "0");
              handleOpenDayModal(`${y}-${m}-${d}`, parseInt(d, 10));
            }}
            className="theme-btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] text-xs font-semibold cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bill</span>
          </button>
        </div>
      </div>

      {/* View Switcher & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-xs">
        {/* Calendar vs Agenda Tabs */}
        <div className="flex items-center bg-[var(--surface-card)] border border-[var(--border-strong)] p-0.5 rounded-xl shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
              viewMode === "calendar"
                ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent-border)] font-semibold shadow-2xs"
                : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Month</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("agenda")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
              viewMode === "agenda"
                ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent-border)] font-semibold shadow-2xs"
                : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Agenda</span>
          </button>
        </div>

        {/* Directional Type Filters & In-Calendar Category Filter */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
              filterType === "all"
                ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[var(--accent-border)] font-semibold"
                : "bg-[var(--surface-card)] text-[var(--fg-secondary)] border-[var(--border-strong)] hover:bg-[var(--surface-subtle)]"
            }`}
          >
            All ({events.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterType("incoming")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
              filterType === "incoming"
                ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)] border-[var(--status-success-border)] font-semibold"
                : "bg-[var(--surface-card)] text-[var(--fg-secondary)] border-[var(--border-strong)] hover:text-[var(--status-success-text)]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Receivables
          </button>

          <button
            type="button"
            onClick={() => setFilterType("outgoing")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
              filterType === "outgoing"
                ? "bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-border)] font-semibold"
                : "bg-[var(--surface-card)] text-[var(--fg-secondary)] border-[var(--border-strong)] hover:text-[var(--accent-text)]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#0070ba]" />
            Bills
          </button>

          {/* In-Calendar Category Dropdown */}
          <select
            id="calendar-category-filter"
            name="calendarCategory"
            value={calendarCategory}
            onChange={(e) => setCalendarCategory(e.target.value)}
            className="bg-[var(--surface-card)] border border-[var(--border-strong)] text-[11px] text-[var(--fg-primary)] rounded-lg px-2.5 py-1 font-medium focus:outline-hidden focus:border-[var(--accent)] cursor-pointer ml-1 shadow-2xs"
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
              type="button"
              onClick={() => setCalendarCategory("all")}
              className="text-[10px] text-[var(--accent-text)] hover:underline font-semibold cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main View Container */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-3 sm:p-4">
        {viewMode === "calendar" ? (
          /* Month Grid View with Dynamic Day Alignment */
          <div className="flex flex-col h-full min-h-[460px] min-w-[540px] sm:min-w-0">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[var(--fg-muted)] pb-2 border-b border-[var(--border-subtle)]">
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
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenDayModal(cell.dateStr, cell.day)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOpenDayModal(cell.dateStr, cell.day);
                    }
                  }}
                  className={`min-h-[85px] sm:min-h-[95px] p-1.5 rounded-xl border transition-all flex flex-col justify-between cursor-pointer group shadow-2xs focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                    cell.isToday
                      ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] shadow-xs"
                      : cell.isCurrentMonth
                      ? "bg-[var(--surface-card)] border-[var(--border-subtle)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-elevated)]"
                      : "bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--fg-muted)] opacity-55 hover:opacity-80"
                  }`}
                  title={`Inspect ${cell.dateStr}`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                        cell.isToday
                          ? "bg-[#0070ba] text-white font-bold shadow-xs"
                          : cell.isCurrentMonth
                          ? "text-[var(--fg-secondary)] group-hover:text-[var(--fg-primary)]"
                          : "text-[var(--fg-muted)]"
                      }`}
                    >
                      {cell.day}
                    </span>
                    {cell.isToday && (
                      <span className="text-[9px] font-bold text-[var(--accent-text)] uppercase tracking-tight">
                        Today
                      </span>
                    )}
                  </div>

                  {/* Day Events Badges */}
                  <div className="flex flex-col gap-1 mt-1 overflow-hidden">
                    {cell.events.map((evt) => {
                      const isIncoming = evt.type === "incoming";
                      const isOutgoing = evt.type === "outgoing";
                      const isCompleted = isEventCompletedForDate(evt, cell.dateStr, todayDateStr);

                      return (
                        <div
                          key={evt.id}
                          className={`flex items-center justify-between w-full text-left p-1 rounded-md text-[10px] transition-all font-medium border shadow-2xs ${
                            isCompleted
                              ? "bg-[var(--surface-subtle)] border-[var(--border-subtle)] text-[var(--fg-muted)] line-through"
                              : isIncoming
                              ? "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]"
                              : isOutgoing
                              ? "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-text)]"
                              : "bg-[var(--status-milestone-bg)] border-[var(--status-milestone-border)] text-[var(--status-milestone-text)]"
                          }`}
                          title={`${evt.title} - $${evt.amount.toFixed(2)} (${
                            isCompleted ? "completed" : evt.status
                          })`}
                        >
                          <span className="truncate flex items-center gap-1">
                            <span className="font-bold shrink-0 tabular-nums">
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
                                className="p-0.5 text-[var(--fg-muted)] hover:text-[var(--status-success-text)] rounded cursor-pointer"
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="w-3 h-3 text-[var(--status-success-text)]" />
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
                                className="p-0.5 text-[var(--fg-muted)] hover:text-[var(--status-danger-text)] rounded cursor-pointer"
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
          <div className="flex flex-col gap-2.5">
            {displayedEvents.map((evt) => {
              const isIncoming = evt.type === "incoming";
              const isOutgoing = evt.type === "outgoing";
              const isCompleted = isEventCompletedForDate(
                evt,
                evt.date || todayDateStr,
                todayDateStr
              );

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
                      ? "bg-[var(--surface-elevated)] border-[var(--border-subtle)] opacity-60"
                      : "bg-[var(--surface-card)] border-[var(--border-subtle)] hover:border-[var(--accent-border)]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isCompleted
                          ? "bg-[var(--surface-subtle)] border-[var(--border-subtle)] text-[var(--fg-muted)]"
                          : isIncoming
                          ? "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]"
                          : isOutgoing
                          ? "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-text)]"
                          : "bg-[var(--status-milestone-bg)] border-[var(--status-milestone-border)] text-[var(--status-milestone-text)]"
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

                    <div className="min-w-0">
                      <p
                        className={`text-xs font-semibold flex flex-wrap items-center gap-2 ${
                          isCompleted ? "text-[var(--fg-muted)] line-through" : "text-[var(--fg-primary)]"
                        }`}
                      >
                        {evt.title}
                        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-[var(--fg-secondary)] border border-[var(--border-subtle)]">
                          {evt.category}
                        </span>
                        {isCompleted && (
                          <span className="text-[9px] font-semibold text-[var(--status-success-text)] uppercase">
                            Completed
                          </span>
                        )}
                      </p>
                      {(() => {
                        const lifecycle = extractLifecycle(evt.counterparty, evt.date);
                        return (
                          <div className="text-[11px] text-[var(--fg-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {lifecycle.cleanName && (
                              <span>
                                <span className="text-[var(--fg-secondary)] font-medium">{lifecycle.cleanName}</span> ·
                              </span>
                            )}
                            <span>
                              Due: <span className="text-[var(--fg-secondary)] font-mono font-medium">{evt.date}</span>
                            </span>
                            {evt.type === "outgoing" && (
                              <>
                                <span>·</span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                                    lifecycle.isOngoing
                                      ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)] border-[var(--status-success-border)]"
                                      : "bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-border)]"
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

                  <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--border-subtle)]">
                    <div className="text-right">
                      <span
                        className={`text-sm font-bold font-mono block tabular-nums ${
                          isCompleted
                            ? "text-[var(--fg-muted)]"
                            : isIncoming
                            ? "text-[var(--status-success-text)]"
                            : isOutgoing
                            ? "text-[var(--fg-primary)]"
                            : "text-[var(--status-milestone-text)]"
                        }`}
                      >
                        {evt.amount > 0 ? `${isIncoming ? "+" : "-"}$${evt.amount.toFixed(2)}` : "Milestone"}
                      </span>
                      <span className="text-[10px] text-[var(--fg-muted)] uppercase font-medium">
                        {evt.type === "incoming" ? "Receivable" : evt.type === "outgoing" ? "Bill" : "Action"}
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
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-2xs focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                            isCompleted
                              ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)] border border-[var(--status-success-border)]"
                              : "bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-[var(--fg-primary)] border border-[var(--border-strong)]"
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
                          className="p-1.5 rounded-lg bg-[var(--surface-subtle)] hover:bg-[var(--status-danger-bg)] text-[var(--fg-muted)] hover:text-[var(--status-danger-text)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
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
        )}
      </div>

      {/* Bottom Status / Legend */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] text-[11px] text-[var(--fg-muted)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Receivables
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#0070ba]" /> Subscriptions &amp; Bills
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-indigo-500" /> Checkpoints
          </span>
        </div>
      </div>

      {/* Dual-Pane Day Details & Scheduling Popup Modal (Portalled to document.body at z-[200]) */}
      {selectedDayModal && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onClick={() => setSelectedDayModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selectedDayModal.formattedTitle}
            onClick={(e) => e.stopPropagation()}
            className="theme-modal border rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] relative"
          >
            {/* Prominent Liquid Flow Animation */}
            <div className="absolute top-0 left-0 right-0 z-10 liquid-bar" />

            {/* Modal Header */}
            <div className="theme-modal-header flex items-center justify-between px-5 py-4 border-b mt-[3px]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] shadow-2xs shrink-0">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--fg-primary)] truncate">
                    {selectedDayModal.formattedTitle}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2.5 text-xs mt-0.5 font-mono tabular-nums">
                    <span className="text-[var(--status-danger-text)] font-semibold">
                      Due: -${selectedDayTotalBills.toFixed(2)}
                    </span>
                    <span className="text-[var(--fg-muted)]">·</span>
                    <span className="text-[var(--status-success-text)] font-semibold">
                      In: +${selectedDayTotalReceivables.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDayModal(null)}
                className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] p-1.5 rounded-lg hover:bg-[var(--surface-subtle)] active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--accent)] cursor-pointer transition-colors"
                title="Close modal"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Dual Pane Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-y-auto divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
              {/* Left Pane (7 cols): List of Bills / Reminders for this Day */}
              <div className="md:col-span-7 p-4 sm:p-5 flex flex-col gap-3 overflow-y-auto bg-[var(--surface-card)]">
                <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)]">
                  <h4 className="text-xs font-bold text-[var(--fg-primary)] uppercase tracking-wider flex items-center gap-1.5">
                    <span>Scheduled</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--surface-subtle)] text-[var(--fg-secondary)] border border-[var(--border-subtle)] font-mono font-medium">
                      {selectedDayEvents.length}
                    </span>
                  </h4>
                </div>

                {selectedDayEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-[var(--surface-elevated)] rounded-xl border border-dashed border-[var(--border-strong)] flex-1 min-h-[160px]">
                    <div className="w-10 h-10 rounded-xl bg-[var(--surface-subtle)] flex items-center justify-center text-[var(--fg-muted)] mb-2">
                      <Clock className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-[var(--fg-primary)]">No scheduled items</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {selectedDayEvents.map((evt) => {
                      const isIncoming = evt.type === "incoming";
                      const isOutgoing = evt.type === "outgoing";
                      const isCompleted = isEventCompletedForDate(
                        evt,
                        selectedDayModal?.dateStr || todayDateStr,
                        todayDateStr
                      );
                      const lifecycle = extractLifecycle(evt.counterparty, evt.date);

                      return (
                        <div
                          key={evt.id}
                          className={`p-3 rounded-xl border transition-all flex flex-col gap-2 shadow-2xs ${
                            isCompleted
                              ? "bg-[var(--surface-elevated)] border-[var(--border-subtle)] opacity-60"
                              : "bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-[var(--accent-border)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                                  isCompleted
                                    ? "bg-[var(--surface-subtle)] border-[var(--border-subtle)] text-[var(--fg-muted)]"
                                    : isIncoming
                                    ? "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]"
                                    : isOutgoing
                                    ? "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-text)]"
                                    : "bg-[var(--status-milestone-bg)] border-[var(--status-milestone-border)] text-[var(--status-milestone-text)]"
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

                              <div className="min-w-0">
                                <p
                                  className={`text-xs font-semibold truncate ${
                                    isCompleted ? "text-[var(--fg-muted)] line-through" : "text-[var(--fg-primary)]"
                                  }`}
                                >
                                  {evt.title}
                                </p>
                                <div className="flex flex-col gap-1 mt-0.5 text-[11px] text-[var(--fg-muted)]">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-[var(--fg-secondary)] border border-[var(--border-subtle)] text-[10px]">
                                      {evt.category}
                                    </span>
                                    {lifecycle.cleanName && (
                                      <span className="text-[var(--fg-secondary)] font-medium">
                                        {lifecycle.cleanName}
                                      </span>
                                    )}
                                  </div>
                                  {evt.type === "outgoing" && (
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--fg-muted)]">
                                      {lifecycle.startDate && (
                                        <span>
                                          Started: <span className="text-[var(--fg-secondary)] font-mono font-medium">{lifecycle.startDate}</span>
                                        </span>
                                      )}
                                      <span>·</span>
                                      <span
                                        className={
                                          lifecycle.isCancelled
                                            ? "text-[var(--status-danger-text)] font-medium"
                                            : lifecycle.isOngoing
                                            ? "text-[var(--status-success-text)]"
                                            : "text-[var(--accent-text)] font-medium"
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
                                className={`text-sm font-bold font-mono block tabular-nums ${
                                  isCompleted
                                    ? "text-[var(--fg-muted)] line-through"
                                    : isIncoming
                                    ? "text-[var(--status-success-text)]"
                                    : isOutgoing
                                    ? "text-[var(--status-danger-text)]"
                                    : "text-[var(--status-milestone-text)]"
                                }`}
                              >
                                {evt.amount > 0 ? `${isIncoming ? "+" : "-"}$${evt.amount.toFixed(2)}` : "Milestone"}
                              </span>
                              <span
                                className={`text-[9px] uppercase font-semibold ${
                                  isCompleted
                                    ? "text-[var(--status-success-text)] bg-[var(--status-success-bg)] px-1.5 py-0.5 rounded border border-[var(--status-success-border)]"
                                    : isIncoming
                                    ? "text-[var(--status-success-text)]"
                                    : "text-[var(--fg-muted)]"
                                }`}
                              >
                                {isCompleted ? "Settled" : evt.type}
                              </span>
                            </div>
                          </div>

                          {/* Action Row */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs">
                            <span className="text-[10px] text-[var(--fg-muted)]">
                              Status: <span className="text-[var(--fg-primary)] font-medium capitalize">{evt.status}</span>
                            </span>

                            <div className="flex items-center gap-2">
                              {onToggleStatus && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onToggleStatus(evt.id, isCompleted ? "scheduled" : "completed")
                                  }
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-2xs focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                                    isCompleted
                                      ? "bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)] text-[var(--fg-secondary)] border border-[var(--border-strong)]"
                                      : "bg-[var(--status-success-bg)] hover:opacity-90 text-[var(--status-success-text)] border border-[var(--status-success-border)]"
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
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--surface-card)] hover:bg-[var(--status-danger-bg)] text-[var(--fg-muted)] hover:text-[var(--status-danger-text)] border border-[var(--border-strong)] transition-colors cursor-pointer text-xs"
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
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--surface-card)] hover:bg-[var(--status-danger-bg)] text-[var(--fg-secondary)] hover:text-[var(--status-danger-text)] border border-[var(--border-strong)] transition-colors cursor-pointer text-xs font-medium"
                                  title="Cancel subscription"
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
              <div className="md:col-span-5 p-4 sm:p-5 bg-[var(--surface-elevated)] flex flex-col justify-between">
                <div>
                  <div className="pb-2 mb-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[var(--fg-primary)] uppercase tracking-wider flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                      <span>Add Item</span>
                    </h4>
                    <span className="text-[11px] text-[var(--fg-secondary)] font-mono">
                      {selectedDayModal.dateStr}
                    </span>
                  </div>

                  <form onSubmit={handleCreateEventForDay} className="flex flex-col gap-3">
                    <div>
                      <label htmlFor="scheduler-item-title" className="text-[11px] font-semibold text-[var(--fg-secondary)] block mb-1">
                        Title
                      </label>
                      <input
                        id="scheduler-item-title"
                        name="title"
                        type="text"
                        placeholder="WiFi, Retainer, Split"
                        value={modalTitle}
                        onChange={(e) => setModalTitle(e.target.value)}
                        required
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-xs text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-hidden focus:border-[var(--accent)] shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="scheduler-item-amount" className="text-[11px] font-semibold text-[var(--fg-secondary)] block mb-1">
                          Amount ($)
                        </label>
                        <div className="relative">
                          <DollarSign className="w-3.5 h-3.5 absolute left-2 top-2 text-[var(--fg-muted)]" />
                          <input
                            id="scheduler-item-amount"
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={modalAmount}
                            onChange={(e) => setModalAmount(e.target.value)}
                            required
                            className="w-full pl-6 pr-2 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-xs text-[var(--fg-primary)] font-mono focus:outline-hidden focus:border-[var(--accent)] shadow-2xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="scheduler-item-type" className="text-[11px] font-semibold text-[var(--fg-secondary)] block mb-1">
                          Type
                        </label>
                        <select
                          id="scheduler-item-type"
                          name="type"
                          value={modalType}
                          onChange={(e) => setModalType(e.target.value as "incoming" | "outgoing" | "milestone")}
                          className="w-full px-2 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-[11px] text-[var(--fg-primary)] focus:outline-hidden focus:border-[var(--accent)] cursor-pointer shadow-2xs"
                        >
                          <option value="outgoing">Bill Due</option>
                          <option value="incoming">Receivable</option>
                          <option value="milestone">Checkpoint</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="scheduler-item-category" className="text-[11px] font-semibold text-[var(--fg-secondary)] block mb-1">
                        Category
                      </label>
                      <select
                        id="scheduler-item-category"
                        name="category"
                        value={modalCategory}
                        onChange={(e) => setModalCategory(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-[11px] text-[var(--fg-primary)] focus:outline-hidden focus:border-[var(--accent)] cursor-pointer shadow-2xs"
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
                      <label htmlFor="scheduler-item-counterparty" className="text-[11px] font-semibold text-[var(--fg-secondary)] block mb-1">
                        Counterparty
                      </label>
                      <input
                        id="scheduler-item-counterparty"
                        name="counterparty"
                        type="text"
                        placeholder="Netflix, Alex, Landlord"
                        value={modalCounterparty}
                        onChange={(e) => setModalCounterparty(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-xs text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-hidden focus:border-[var(--accent)] shadow-2xs"
                      />
                    </div>

                    {/* Subscription & Contract Lifecycle Fields */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="scheduler-item-start-date" className="text-[11px] font-semibold text-[var(--fg-secondary)] block mb-1">
                          Start Date
                        </label>
                        <input
                          id="scheduler-item-start-date"
                          name="startDate"
                          type="date"
                          value={modalStartDate}
                          onChange={(e) => setModalStartDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-xs text-[var(--fg-primary)] focus:outline-hidden focus:border-[var(--accent)] shadow-2xs"
                        />
                      </div>

                      <div>
                        <label htmlFor="scheduler-item-end-date" className="text-[11px] font-semibold text-[var(--fg-secondary)] block mb-1">
                          End Date
                        </label>
                        <input
                          id="scheduler-item-end-date"
                          name="endDate"
                          type="date"
                          value={modalEndDate}
                          onChange={(e) => setModalEndDate(e.target.value)}
                          placeholder="Ongoing"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-xs text-[var(--fg-primary)] focus:outline-hidden focus:border-[var(--accent)] shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Quick Duration Preset Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap -mt-1">
                      <span className="text-[10px] text-[var(--fg-muted)]">Duration:</span>
                      <button
                        type="button"
                        onClick={() => setModalEndDate("")}
                        className={`text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors border shadow-2xs ${
                          !modalEndDate
                            ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[var(--accent-border)] font-bold"
                            : "bg-[var(--surface-card)] text-[var(--fg-secondary)] border-[var(--border-strong)] hover:text-[var(--fg-primary)]"
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
                        className="text-[10px] px-2 py-0.5 rounded bg-[var(--surface-card)] text-[var(--fg-secondary)] border border-[var(--border-strong)] hover:text-[var(--fg-primary)] cursor-pointer transition-colors shadow-2xs"
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
                        className="text-[10px] px-2 py-0.5 rounded bg-[var(--surface-card)] text-[var(--fg-secondary)] border border-[var(--border-strong)] hover:text-[var(--fg-primary)] cursor-pointer transition-colors shadow-2xs"
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
                        className="text-[10px] px-2 py-0.5 rounded bg-[var(--surface-card)] text-[var(--fg-secondary)] border border-[var(--border-strong)] hover:text-[var(--fg-primary)] cursor-pointer transition-colors shadow-2xs"
                      >
                        3 Years
                      </button>
                    </div>

                    <button
                      type="submit"
                      className="theme-btn-primary mt-2 w-full py-2.5 rounded-xl active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Day</span>
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
