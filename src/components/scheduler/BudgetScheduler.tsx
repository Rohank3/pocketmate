"use client";

import React, { useRef, useState, useMemo, useEffect } from "react";
import "@bryntum/scheduler-enterprise/scheduler.css";
import "@bryntum/scheduler-enterprise/stockholm-dark.css";
import {
  BryntumScheduler,
  BryntumSchedulerProjectModel,
} from "@bryntum/scheduler-react-enterprise";
import type {
  BryntumSchedulerProps,
  BryntumSchedulerProjectModelProps,
} from "@bryntum/scheduler-react-enterprise";
import { Calendar, DollarSign, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";

interface SchedulerInstance {
  zoomIn?: () => void;
  zoomOut?: () => void;
  zoomToFit?: () => void;
  resourceStore?: {
    data: unknown[];
  };
}

// Register Bryntum Enterprise 45-day trial license key from environment if present
declare const bryntum: { licenseKey?: string };
const BRYNTUM_ENTERPRISE_LICENSE_KEY =
  process.env.NEXT_PUBLIC_BRYNTUM_LICENSE_KEY || "";

if (BRYNTUM_ENTERPRISE_LICENSE_KEY) {
  if (typeof window !== "undefined") {
    (window as unknown as { bryntum?: { licenseKey?: string } }).bryntum =
      (window as unknown as { bryntum?: { licenseKey?: string } }).bryntum || {};
    (window as unknown as { bryntum: { licenseKey: string } }).bryntum.licenseKey =
      BRYNTUM_ENTERPRISE_LICENSE_KEY;
  }
  if (typeof bryntum !== "undefined") {
    bryntum.licenseKey = BRYNTUM_ENTERPRISE_LICENSE_KEY;
  }
}

export interface BudgetSchedulerProps {
  categories?: CategoryItem[];
  selectedCategory?: string;
  onEventClick?: (eventName: string) => void;
}

export default function BudgetScheduler({
  categories,
  selectedCategory = "all",
  onEventClick,
}: BudgetSchedulerProps) {
  const projectRef = useRef<BryntumSchedulerProjectModel>(null);
  const schedulerRef = useRef<BryntumScheduler>(null);

  const allResources = useMemo(() => {
    const categoryRows = (categories && categories.length > 0
      ? categories
      : [
          { id: "cat_groceries", name: "Groceries", monthlyCap: 400, color: "#10b981" },
          { id: "cat_dining", name: "Dining & Social", monthlyCap: 250, color: "#3b82f6" },
          { id: "cat_entertainment", name: "Entertainment", monthlyCap: 150, color: "#8b5cf6" },
          { id: "cat_shopping", name: "Shopping & Retail", monthlyCap: 200, color: "#ec4899" },
        ]
    ).map((c) => {
      const resId = c.id.startsWith("res_")
        ? c.id
        : c.id.startsWith("cat_")
        ? c.id.replace("cat_", "res_")
        : `res_${c.id}`;
      return {
        id: resId,
        name: `${c.name} (Cap: $${c.monthlyCap})`,
        iconCls: "b-fa b-fa-tag",
        category: c.name,
      };
    });

    const counterparties = [
      { id: "res_dave", name: "Dave Chen (Split Debtor)", iconCls: "b-fa b-fa-user", category: "Dining" },
      { id: "res_alex", name: "Alex Miller (Split Debtor)", iconCls: "b-fa b-fa-user", category: "Dining" },
      { id: "res_sarah", name: "Sarah Jenkins (Split Debtor)", iconCls: "b-fa b-fa-user", category: "Shopping" },
      { id: "res_recurring", name: "Fixed Subscriptions", iconCls: "b-fa b-fa-repeat", category: "General" },
    ];

    return [...categoryRows, ...counterparties];
  }, [categories]);

  const allEvents = useMemo(() => [
    {
      id: "evt_1",
      resourceId: "res_groceries",
      name: "$82.50 Target Superstore",
      startDate: "2026-11-04 15:15",
      duration: 1,
      durationUnit: "d",
      eventColor: "#10b981",
    },
    {
      id: "evt_2",
      resourceId: "res_groceries",
      name: "$340.00 Whole Foods (OVER CAP ⚠️)",
      startDate: "2026-11-05 10:00",
      duration: 1.5,
      durationUnit: "d",
      eventColor: "#f43f5e",
    },
    {
      id: "evt_3",
      resourceId: "res_dining",
      name: "$130.00 Bistro Lumiere (Disputed)",
      startDate: "2026-11-05 20:30",
      duration: 2,
      durationUnit: "d",
      eventColor: "#e11d48",
    },
    {
      id: "evt_4",
      resourceId: "res_dining",
      name: "$65.00 Downtown Craft Bar (Split)",
      startDate: "2026-11-06 23:30",
      duration: 1,
      durationUnit: "d",
      eventColor: "#3b82f6",
    },
    {
      id: "evt_5",
      resourceId: "res_entertainment",
      name: "$85.00 Bowlero Lanes Bowling",
      startDate: "2026-11-06 21:00",
      duration: 1,
      durationUnit: "d",
      eventColor: "#8b5cf6",
    },
    {
      id: "evt_6",
      resourceId: "res_dave",
      name: "PayPal Invoice: Dave Chen ($65 Due)",
      startDate: "2026-11-07 09:00",
      duration: 2,
      durationUnit: "d",
      eventColor: "#f59e0b",
    },
    {
      id: "evt_7",
      resourceId: "res_alex",
      name: "PayPal Invoice: Alex Miller ($42.50 Due)",
      startDate: "2026-11-08 09:00",
      duration: 2,
      durationUnit: "d",
      eventColor: "#f59e0b",
    },
    {
      id: "evt_8",
      resourceId: "res_sarah",
      name: "Settlement Reminder: Sarah ($79)",
      startDate: "2026-11-09 10:00",
      duration: 1.5,
      durationUnit: "d",
      eventColor: "#06b6d4",
    },
    {
      id: "evt_9",
      resourceId: "res_recurring",
      name: "Cloud Hosting: AWS & DigitalOcean ($95)",
      startDate: "2026-11-12 00:00",
      duration: 1,
      durationUnit: "d",
      eventColor: "#64748b",
    },
    {
      id: "evt_10",
      resourceId: "res_groceries",
      name: "Mid-Month Budget Checkpoint",
      startDate: "2026-11-15 09:00",
      duration: 1,
      durationUnit: "d",
      eventColor: "#0284c7",
    },
    {
      id: "evt_11",
      resourceId: "res_recurring",
      name: "SaaS Subscriptions (GitHub, OpenAI)",
      startDate: "2026-11-20 00:00",
      duration: 1,
      durationUnit: "d",
      eventColor: "#64748b",
    },
    {
      id: "evt_12",
      resourceId: "res_dining",
      name: "End-of-Month Ambiguity Sweep & Triage",
      startDate: "2026-11-28 18:00",
      duration: 2,
      durationUnit: "d",
      eventColor: "#6366f1",
    },
  ], []);

  // Filter resources when a category is selected
  const filteredResources = useMemo(() => {
    if (!selectedCategory || selectedCategory.toLowerCase() === "all") {
      return allResources;
    }
    const target = selectedCategory.toLowerCase();
    const matched = allResources.filter(
      (r) =>
        r.category.toLowerCase() === target ||
        r.name.toLowerCase().includes(target) ||
        target.includes(r.category.toLowerCase())
    );
    return matched.length > 0 ? matched : allResources;
  }, [allResources, selectedCategory]);

  const [projectProps] = useState<BryntumSchedulerProjectModelProps>(() => ({
    resources: allResources,
    events: allEvents,
  }));

  const [schedulerProps] = useState<BryntumSchedulerProps>(() => ({
    startDate: new Date(2026, 10, 3), // Nov 3, 2026
    endDate: new Date(2026, 10, 16), // Nov 16, 2026
    viewPreset: "dayAndWeek",
    tickSize: 120, // Wider ticks to eliminate text truncation
    barMargin: 6,
    rowHeight: 56,
    columns: [
      {
        type: "resourceInfo",
        text: "Category / Counterparty",
        field: "name",
        width: 220,
        showImage: false,
      },
    ],
    stripeFeature: true,
    timeRangesFeature: true,
    eventTooltipFeature: {
      template: (data: { eventRecord: { name: string; startDate: Date; duration: number } }) => {
        const { eventRecord } = data;
        return `
          <div style="padding: 8px; font-family: sans-serif; font-size: 12px; color: #f4f4f5;">
            <div style="font-weight: bold; margin-bottom: 4px; color: #38bdf8;">${eventRecord.name}</div>
            <div>Scheduled Date: ${eventRecord.startDate ? new Date(eventRecord.startDate).toLocaleDateString() : ""}</div>
            <div>Duration: ${eventRecord.duration || 1} day(s)</div>
          </div>
        `;
      },
    },
    onEventClick: (event: { eventRecord?: { name?: string } }) => {
      if (event.eventRecord?.name && onEventClick) {
        onEventClick(event.eventRecord.name);
      }
    },
  }));

  // Keep Bryntum resource store reactive to category changes & filtering
  useEffect(() => {
    if (projectRef.current?.instance) {
      const project = projectRef.current.instance as unknown as SchedulerInstance;
      if (project.resourceStore) {
        project.resourceStore.data = filteredResources;
      }
    }
  }, [filteredResources]);

  // Zoom control handlers
  const handleZoomIn = () => {
    (schedulerRef.current?.instance as unknown as SchedulerInstance)?.zoomIn?.();
  };

  const handleZoomOut = () => {
    (schedulerRef.current?.instance as unknown as SchedulerInstance)?.zoomOut?.();
  };

  const handleZoomToFit = () => {
    (schedulerRef.current?.instance as unknown as SchedulerInstance)?.zoomToFit?.();
  };

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden shadow-xl">
      {/* Bryntum Scheduler Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
          <span className="font-semibold text-zinc-200">Bryntum Scheduler Timeline</span>
          {selectedCategory && selectedCategory.toLowerCase() !== "all" && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/70 border border-blue-800/60 text-blue-300">
              Filter: {selectedCategory}
            </span>
          )}
        </div>

        {/* Interactive Zoom Controls for Clarity */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-zinc-300">
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 cursor-pointer"
              title="Zoom In (Wider daily columns)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomToFit}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 cursor-pointer"
              title="Fit Timeline to Screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-400">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            Nov 2026 Window
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <DollarSign className="w-3.5 h-3.5" />
            Deterministic
          </span>
        </div>
      </div>

      {/* Scheduler Canvas Container */}
      <div className="flex-1 w-full min-h-[520px] relative">
        <BryntumSchedulerProjectModel
          ref={projectRef}
          {...projectProps}
          resources={filteredResources}
        />
        <BryntumScheduler ref={schedulerRef} project={projectRef} {...schedulerProps} />
      </div>

      {/* Scheduler Legend & Tip */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-zinc-900/80 border-t border-zinc-800 text-[11px] text-zinc-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Settled
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Over Budget
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Invoice Due
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Reconciled
          </span>
        </div>
        <span className="text-zinc-500 text-[10px]">
          Double-click any event to launch editor · Use Zoom (+) for detailed spacing
        </span>
      </div>
    </div>
  );
}
