"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  studioTheme,
  AgStudioLicenseManager,
  type AgDataSourcesDefinition,
  type AgReportState,
  type AgStudioApi,
  type AgStudioMode,
  type AgWidgetLayoutState,
  type AgFormat,
  type AgFieldDefinition,
} from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import {
  BarChart3,
  Layers,
  SlidersHorizontal,
  RotateCcw,
  Eye,
  Edit3,
} from "lucide-react";

// Securely register license key from environment variable (never hardcoded in source)
const STUDIO_LICENSE_KEY =
  process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY || "";

if (STUDIO_LICENSE_KEY && typeof window !== "undefined") {
  AgStudioLicenseManager.setLicenseKey(STUDIO_LICENSE_KEY);
}

// Helpers for data sources definition
type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide && { hide }) }));

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({
  xTrack,
  yTrack,
  xSpan,
  ySpan,
});

const sum = (id: string) => ({ id, aggregation: "sum" as const });
const countd = (id: string) => ({ id, aggregation: "countd" as const });

const pocketMateDarkTheme = studioTheme.withParams({
  fontSize: 13,
  textColor: "#f4f4f5",
  foregroundColor: "#f4f4f5",
  subtleTextColor: "#a1a1aa",
  backgroundColor: "#09090b",
  borderColor: "#27272a",
  accentColor: "#3b82f6",
  iconColor: "#60a5fa",
  rowHoverColor: "#1e293b",

  studioWrapperBorder: false,
  studioWrapperBorderRadius: 10,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: "#09090b",
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 10,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: "#09090b",
  studioCanvasPadding: 16,
  studioCanvasRowHeight: 18,

  studioWidgetBackgroundColor: "#18181b",
  studioWidgetBorder: { width: 1, color: "#27272a" },
  studioWidgetBorderRadius: 8,
  studioWidgetPadding: 10,
  studioWidgetTitleFontSize: 14,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: "#f4f4f5",
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleTextColor: "#a1a1aa",

  studioPanelContainerBackgroundColor: "#18181b",
  studioPanelContainerBorder: { width: 1, color: "#27272a" },
  studioPanelContainerBorderRadius: 0,
  studioPanelDividerColor: "#27272a",
  studioPanelDividerActiveColor: "#3b82f6",

  gridFontSize: 13,
  gridCellTextColor: "#f4f4f5",
  gridHeaderBackgroundColor: "#18181b",
  gridHeaderTextColor: "#a1a1aa",
  gridHeaderFontWeight: 600,
  gridHeaderFontSize: 12,
  gridRowHeight: 36,
  gridRowBorder: { width: 1, color: "#27272a" },
  gridHeaderRowBorder: { width: 1, color: "#3f3f46" },
  gridRowHoverColor: "#1e293b",
  gridWrapperBorder: false,

  chartTextColor: "#f4f4f5",
  chartSubtleTextColor: "#a1a1aa",
  chartAxisLineColor: "#27272a",
  chartGridLineColor: "#1e293b",
});

const DEFAULT_REPORT_STATE: AgReportState = {
  selectedPageId: "page_cashflow",
  pages: [
    {
      id: "page_cashflow",
      widgets: {
        "kpi-unsettled": {
          type: "value",
          dataMapping: {
            value: [sum("invoices.outstanding")],
          },
          format: {
            title: { enabled: true, text: "Unsettled Debts" },
            caption: { enabled: true, text: "Pending Penny-Locked Invoices" },
          },
        },
        "kpi-groceries-cap": {
          type: "value",
          dataMapping: {
            value: [sum("categories.spent")],
          },
          format: {
            title: { enabled: true, text: "Monthly Category Spend" },
            caption: { enabled: true, text: "Groceries Breach Over Cap" },
          },
        },
        "kpi-tx-count": {
          type: "value",
          dataMapping: {
            value: [countd("transactions.id")],
          },
          format: {
            title: { enabled: true, text: "Reconciled Records" },
            caption: { enabled: true, text: "Live PayPal Sandbox Stream" },
          },
        },
        "category-spend-donut": {
          type: "donut-chart",
          dataMapping: {
            categoryKey: [{ id: "transactions.category" }],
            valueKey: [sum("transactions.amount")],
          },
          format: {
            title: { enabled: true, text: "Spending Share by Category" },
          },
        },
        "category-caps-bar": {
          type: "bar-chart-grouped",
          dataMapping: {
            categoryKey: [{ id: "categories.name" }],
            valueKey: [
              { id: "categories.budgetCap", aggregation: "sum" },
              { id: "categories.spent", aggregation: "sum" },
            ],
          },
          format: {
            title: { enabled: true, text: "Monthly Budget Caps vs Actual Spend ($)" },
          },
        },
        "transactions-grid": {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "transactions.date" },
              { id: "transactions.merchant" },
              { id: "transactions.category" },
              { id: "transactions.debtor" },
              { id: "transactions.status" },
              sum("transactions.amount"),
            ],
          },
          format: {
            title: { enabled: true, text: "Reconciled Transaction Stream" },
          },
        },
      },
      widgetLayout: {
        "kpi-unsettled": at(0, 0, 8, 5),
        "kpi-groceries-cap": at(8, 0, 8, 5),
        "kpi-tx-count": at(16, 0, 8, 5),
        "category-spend-donut": at(0, 5, 10, 15),
        "category-caps-bar": at(10, 5, 14, 15),
        "transactions-grid": at(0, 20, 24, 16),
      },
    },
    {
      id: "page_receivables",
      widgets: {
        "debtor-pivot": {
          type: "pivot-grid",
          dataMapping: {
            rows: [{ id: "invoices.debtor" }],
            columns: [{ id: "invoices.status" }],
            values: [sum("invoices.outstanding")],
          },
          format: {
            title: { enabled: true, text: "Debtor Receivables Matrix by Settlement Status" },
          },
        },
        "invoices-grid": {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "invoices.debtor" },
              { id: "invoices.memo" },
              { id: "invoices.status" },
              sum("invoices.amount"),
              sum("invoices.outstanding"),
            ],
          },
          format: {
            title: { enabled: true, text: "Dispatched Invoices & Reminders" },
          },
        },
      },
      widgetLayout: {
        "debtor-pivot": at(0, 0, 24, 14),
        "invoices-grid": at(0, 14, 24, 16),
      },
    },
  ],
};

export default function FinancialStudio() {
  const apiRef = useRef<AgStudioApi | null>(null);
  const [mode, setMode] = useState<AgStudioMode>("view");

  const studioData = useMemo<AgDataSourcesDefinition>(() => ({
    description: "PocketMate financial orchestrator data model for self-serve reporting and budgeting.",
    sources: [
      {
        id: "transactions",
        name: "Transactions",
        description: "PayPal synced bank and card transactions with status and assigned debtors.",
        data: [
          { id: "tx_1", date: "2026-11-06", merchant: "Downtown Craft Bar & Grill", category: "Dining", debtor: "Dave Chen & Group", amount: 65.0, status: "Settled" },
          { id: "tx_2", date: "2026-11-06", merchant: "Bowlero Lanes", category: "Entertainment", debtor: "Dave Chen & Group", amount: 85.0, status: "Settled" },
          { id: "tx_3", date: "2026-11-06", merchant: "Midnight Diner", category: "Dining", debtor: "Alex Miller & Group", amount: 50.0, status: "Settled" },
          { id: "tx_4", date: "2026-11-06", merchant: "Zara Mall Galleria", category: "Shopping", debtor: "Sarah Jenkins", amount: 65.0, status: "Pending" },
          { id: "tx_5", date: "2026-11-06", merchant: "Starbucks Coffee", category: "Dining", debtor: "Sarah Jenkins", amount: 14.0, status: "Pending" },
          { id: "tx_6", date: "2026-11-05", merchant: "Target Superstore", category: "Groceries", debtor: "Self", amount: 82.5, status: "Settled" },
          { id: "tx_7", date: "2026-11-05", merchant: "Whole Foods Market", category: "Groceries", debtor: "Self", amount: 340.0, status: "Cap Exceeded" },
          { id: "tx_8", date: "2026-11-05", merchant: "Bistro Lumiere", category: "Dining", debtor: "Mark & Leo Split", amount: 130.0, status: "Disputed" },
          { id: "tx_9", date: "2026-11-04", merchant: "SQ* Urban Blend", category: "Dining", debtor: "Unassigned", amount: 34.2, status: "Unassigned" },
        ],
        fields: fields([
          ["id", "Transaction ID", "textFormat", true],
          ["date", "Date", "dateFormat"],
          ["merchant", "Merchant", "textFormat"],
          ["category", "Category", "textFormat"],
          ["debtor", "Debtor / Counterparty", "textFormat"],
          ["amount", "Amount ($)", "currencyFormat"],
          ["status", "Status", "textFormat"],
        ]),
      },
      {
        id: "categories",
        name: "Budget Categories",
        description: "Monthly budget caps and spend allocations.",
        data: [
          { id: "cat_groceries", name: "Groceries", budgetCap: 400.0, spent: 422.5, isBreached: true },
          { id: "cat_dining", name: "Dining & Social", budgetCap: 250.0, spent: 195.0, isBreached: false },
          { id: "cat_entertainment", name: "Entertainment", budgetCap: 150.0, spent: 85.0, isBreached: false },
          { id: "cat_shopping", name: "Shopping & Retail", budgetCap: 200.0, spent: 65.0, isBreached: false },
        ],
        fields: fields([
          ["id", "Category ID", "textFormat", true],
          ["name", "Category Name", "textFormat"],
          ["budgetCap", "Monthly Budget Cap ($)", "currencyFormat"],
          ["spent", "Actual Spent ($)", "currencyFormat"],
          ["isBreached", "Cap Exceeded", "booleanFormat"],
        ]),
      },
      {
        id: "invoices",
        name: "PayPal Invoices",
        description: "Penny-locked split payment invoices and debt tracking.",
        data: [
          { id: "inv_1", debtor: "Dave Chen", memo: "Downtown Bar & Bowlero Split", amount: 65.0, outstanding: 65.0, status: "Pending" },
          { id: "inv_2", debtor: "Alex Miller", memo: "Midnight Diner Itemized Split", amount: 42.5, outstanding: 42.5, status: "Pending" },
          { id: "inv_3", debtor: "Sarah Jenkins", memo: "Zara & Coffee Reimbursement", amount: 79.0, outstanding: 79.0, status: "Pending" },
          { id: "inv_4", debtor: "Marcus Vance", memo: "Previous Settled Group Split", amount: 21.25, outstanding: 0.0, status: "Settled" },
        ],
        fields: fields([
          ["id", "Invoice ID", "textFormat", true],
          ["debtor", "Debtor Name", "textFormat"],
          ["memo", "Description", "textFormat"],
          ["amount", "Invoice Total ($)", "currencyFormat"],
          ["outstanding", "Outstanding Balance ($)", "currencyFormat"],
          ["status", "Payment Status", "textFormat"],
        ]),
      },
    ],
  }), []);

  const handleReset = () => {
    if (apiRef.current) {
      apiRef.current.setState(DEFAULT_REPORT_STATE);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden shadow-2xl">
      {/* Studio Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
          <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            AG Studio Embedded Analytics
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300">
            45-Day Enterprise Active
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View / Edit Mode Toggle */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setMode("view")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-all ${
                mode === "view"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Eye className="w-3 h-3" />
              View
            </button>
            <button
              onClick={() => setMode("edit")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-all ${
                mode === "edit"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Edit3 className="w-3 h-3" />
              Customize Widgets
            </button>
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 text-xs cursor-pointer transition-all"
            title="Reset dashboard to default report layout"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Layout
          </button>
        </div>
      </div>

      {/* Embedded AG Studio Canvas */}
      <div className="flex-1 w-full min-h-[520px] relative">
        <AgStudioProvider licenseKey={STUDIO_LICENSE_KEY}>
          <AgStudio
            style={{ height: "100%", width: "100%" }}
            theme={pocketMateDarkTheme}
            layout={{ widgetBorderEnabled: true }}
            data={studioData}
            initialState={DEFAULT_REPORT_STATE}
            mode={mode}
            onApiReady={(event) => {
              apiRef.current = event.api;
            }}
          />
        </AgStudioProvider>
      </div>

      {/* Footer Status */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-t border-zinc-800 text-[11px] text-zinc-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-blue-400" /> 3 Normalized Data Sources
          </span>
          <span className="flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-emerald-400" /> Self-Serve Dynamic Cross-Filtering
          </span>
        </div>
        <span className="text-zinc-500 text-[10px]">
          AG Studio Pro v3.1.0 · Integrated Analytics
        </span>
      </div>
    </div>
  );
}
