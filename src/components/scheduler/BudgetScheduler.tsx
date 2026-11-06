"use client";

import React, { useRef, useState } from "react";
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
import { Calendar, DollarSign } from "lucide-react";

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
  onEventClick?: (eventName: string) => void;
}

export default function BudgetScheduler({ onEventClick }: BudgetSchedulerProps) {
  const projectRef = useRef<BryntumSchedulerProjectModel>(null);
  const schedulerRef = useRef<BryntumScheduler>(null);

  const [projectProps] = useState<BryntumSchedulerProjectModelProps>(() => ({
    resources: [
      { id: "res_groceries", name: "Groceries (Cap: $400)", iconCls: "b-fa b-fa-shopping-cart" },
      { id: "res_dining", name: "Dining & Social (Cap: $250)", iconCls: "b-fa b-fa-utensils" },
      { id: "res_entertainment", name: "Entertainment (Cap: $150)", iconCls: "b-fa b-fa-film" },
      { id: "res_shopping", name: "Shopping & Retail", iconCls: "b-fa b-fa-shopping-bag" },
      { id: "res_dave", name: "Dave Chen (Split Debtor)", iconCls: "b-fa b-fa-user" },
      { id: "res_alex", name: "Alex Miller (Split Debtor)", iconCls: "b-fa b-fa-user" },
      { id: "res_sarah", name: "Sarah Jenkins (Split Debtor)", iconCls: "b-fa b-fa-user" },
      { id: "res_recurring", name: "Fixed Subscriptions", iconCls: "b-fa b-fa-repeat" },
    ],
    events: [
      {
        id: "evt_1",
        resourceId: "res_groceries",
        name: "Target Superstore: $82.50",
        startDate: "2026-11-04 15:15",
        duration: 1,
        durationUnit: "d",
        eventColor: "#10b981",
      },
      {
        id: "evt_2",
        resourceId: "res_groceries",
        name: "Whole Foods Market ($340) - CAP BREACH ⚠️",
        startDate: "2026-11-05 10:00",
        duration: 1.5,
        durationUnit: "d",
        eventColor: "#f43f5e",
      },
      {
        id: "evt_3",
        resourceId: "res_dining",
        name: "Bistro Lumiere: $130 Disputed",
        startDate: "2026-11-05 20:30",
        duration: 2,
        durationUnit: "d",
        eventColor: "#e11d48",
      },
      {
        id: "evt_4",
        resourceId: "res_dining",
        name: "Downtown Craft Bar ($65) - Split Done",
        startDate: "2026-11-06 23:30",
        duration: 1,
        durationUnit: "d",
        eventColor: "#3b82f6",
      },
      {
        id: "evt_5",
        resourceId: "res_entertainment",
        name: "Bowlero Bowling ($85) - Settled",
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
        name: "Pending Split Reminder: Sarah ($79)",
        startDate: "2026-11-09 10:00",
        duration: 1.5,
        durationUnit: "d",
        eventColor: "#06b6d4",
      },
      {
        id: "evt_9",
        resourceId: "res_recurring",
        name: "AWS & DigitalOcean Cloud Bills ($95.00)",
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
        name: "SaaS Subscriptions (GitHub, ChatGPT)",
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
    ],
  }));

  const [schedulerProps] = useState<BryntumSchedulerProps>(() => ({
    startDate: new Date(2026, 10, 3), // Nov 3, 2026
    endDate: new Date(2026, 10, 25), // Nov 25, 2026
    viewPreset: "dayAndWeek",
    barMargin: 5,
    rowHeight: 52,
    columns: [
      {
        type: "resourceInfo",
        text: "Category / Counterparty",
        field: "name",
        width: 230,
        showImage: false,
      },
    ],
    stripeFeature: true,
    timeRangesFeature: true,
    eventTooltipFeature: {
      template: (data: { eventRecord: { name: string; startDate: Date; duration: number } }) => {
        const { eventRecord } = data;
        return `
          <div style="padding: 6px; font-family: sans-serif; font-size: 12px; color: #f4f4f5;">
            <div style="font-weight: bold; margin-bottom: 4px; color: #38bdf8;">${eventRecord.name}</div>
            <div>Date: ${eventRecord.startDate ? new Date(eventRecord.startDate).toLocaleDateString() : ""}</div>
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



  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden shadow-xl">
      {/* Bryntum Scheduler Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
          <span className="font-semibold text-zinc-200">Bryntum Scheduler Enterprise</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/70 border border-blue-800/60 text-blue-300">
            v8.0.0 Enterprise Trial
          </span>
        </div>

        <div className="flex items-center gap-3 text-zinc-400">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px]">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            Nov 2026 Cashflow Window
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <DollarSign className="w-3.5 h-3.5" />
            Deterministic Scheduling
          </span>
        </div>
      </div>

      {/* Scheduler Canvas Container */}
      <div className="flex-1 w-full min-h-[520px] relative">
        <BryntumSchedulerProjectModel ref={projectRef} {...projectProps} />
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
          Double-click any event to launch Bryntum task editor
        </span>
      </div>
    </div>
  );
}
