"use client";

import React, { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  colorSchemeDark,
} from "ag-grid-community";
import {
  DollarSign,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Sparkles,
  Edit3,
  Layers,
  Store,
  Tag,
  X,
  AlertCircle,
  Loader2,
  User,
  Users,
} from "lucide-react";
import { GridMutationState } from "@/types/agent";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";

// Register all community features (RowSelection, Pagination, ColumnFilter, NumberFilter, Validation)
ModuleRegistry.registerModules([AllCommunityModule]);

const darkTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "#09090b",
  headerBackgroundColor: "#18181b",
  borderColor: "#27272a",
  foregroundColor: "#f4f4f5",
  accentColor: "#3b82f6",
  rowHoverColor: "#1e293b",
});

export interface TransactionRow {
  id: string;
  date: string;
  merchant: string;
  memo?: string;
  splitAllocation?: "self" | "split" | "owed";
  category: string;
  debtor_name: string;
  amount: number;
  status: "settled" | "pending" | "disputed" | "unresolved";
  invoiceStatus?: string;
}

export type ReclassifyScope = "single" | "merchant" | "similar";

interface TransactionGridProps {
  rowData: TransactionRow[];
  gridMutation?: GridMutationState | null;
  selectedCategory?: string;
  categories?: CategoryItem[];
  onSelectRow?: (row: TransactionRow) => void;
  onReclassifyTransaction?: (
    transactionId: string,
    merchantName: string,
    targetCategory: string,
    scope: ReclassifyScope
  ) => Promise<{ success: boolean; message: string; updatedTransactionIds: string[] }>;
}

export const TransactionGrid: React.FC<TransactionGridProps> = ({
  rowData,
  gridMutation,
  selectedCategory,
  categories = [],
  onSelectRow,
  onReclassifyTransaction,
}) => {
  // Reclassification modal state
  const [activeTxForEdit, setActiveTxForEdit] = useState<TransactionRow | null>(null);
  const [selectedNewCategory, setSelectedNewCategory] = useState<string>("");
  const [selectedScope, setSelectedScope] = useState<ReclassifyScope | null>(null); // No default!
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleOpenReclassify = (tx: TransactionRow) => {
    setActiveTxForEdit(tx);
    setSelectedNewCategory(tx.category || "");
    setSelectedScope(null); // Explicitly require user choice
    setActionFeedback(null);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setActiveTxForEdit(null);
    setSelectedNewCategory("");
    setSelectedScope(null);
    setActionFeedback(null);
  };

  const handleConfirmReclassification = async () => {
    if (!activeTxForEdit || !selectedNewCategory || !selectedScope || !onReclassifyTransaction) return;

    try {
      setIsSubmitting(true);
      setActionFeedback(null);

      const res = await onReclassifyTransaction(
        activeTxForEdit.id,
        activeTxForEdit.merchant,
        selectedNewCategory,
        selectedScope
      );

      setActionFeedback(res.message || "Category updated successfully!");
      setTimeout(() => {
        setIsSubmitting(false);
        setActiveTxForEdit(null);
      }, 700);
    } catch {
      setIsSubmitting(false);
      setActionFeedback("Failed to update category. Please try again.");
    }
  };

  const columnDefs = useMemo<ColDef<TransactionRow>[]>(() => [
    {
      field: "date",
      headerName: "Date & Time",
      width: 130,
      filter: true,
      sortable: true,
    },
    {
      field: "merchant",
      headerName: "Merchant / Memo",
      flex: 1.6,
      filter: true,
      cellRenderer: (params: ICellRendererParams<TransactionRow, string>) => {
        const isDisputed = params.data?.status === "disputed";
        const memo = params.data?.memo;
        const merchant = params.value || "PayPal Commercial Transfer";
        const showMemo = memo && memo.toLowerCase() !== merchant.toLowerCase();

        return (
          <div className="flex flex-col justify-center py-0.5 leading-tight overflow-hidden">
            <div className="flex items-center gap-1.5 truncate">
              <span className={`font-semibold truncate ${isDisputed ? "text-amber-400" : "text-zinc-100"}`}>
                {merchant}
              </span>
              {isDisputed && (
                <span className="shrink-0 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-normal">
                  Mismatch Flag
                </span>
              )}
            </div>
            {showMemo && (
              <span className="text-[11px] text-zinc-400 font-normal truncate mt-0.5" title={memo}>
                {memo}
              </span>
            )}
          </div>
        );
      },
    },
    {
      field: "category",
      headerName: "Category",
      width: 140,
      filter: true,
      cellRenderer: (params: ICellRendererParams<TransactionRow, string>) => {
        const colors: Record<string, string> = {
          Groceries: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
          Dining: "bg-blue-500/10 text-blue-400 border-blue-500/30",
          Shopping: "bg-purple-500/10 text-purple-400 border-purple-500/30",
          Entertainment: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
          Travel: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        };
        const val = params.value || "Uncategorized";
        const isUncat = val.toLowerCase() === "uncategorized";
        const badgeClass = isUncat
          ? "bg-amber-500/15 text-amber-300 border-amber-500/40 font-medium"
          : colors[val] || "bg-zinc-700/50 text-zinc-300 border-zinc-600";

        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (params.data) {
                handleOpenReclassify(params.data);
              }
            }}
            title="Click to change category"
            className={`group inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border ${badgeClass} hover:ring-1 hover:ring-zinc-400/50 hover:brightness-110 active:scale-95 transition-all cursor-pointer`}
          >
            <span>{val}</span>
            <Edit3 className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity" />
          </button>
        );
      },
    },
    {
      field: "debtor_name",
      headerName: "Debtor / Split",
      width: 145,
      filter: true,
      cellRenderer: (params: ICellRendererParams<TransactionRow, string>) => {
        const isSplit =
          params.data?.splitAllocation === "split" ||
          params.value?.toLowerCase().includes("split") ||
          params.data?.memo?.toLowerCase().includes("split") ||
          params.data?.memo?.toLowerCase().includes("share");

        if (isSplit) {
          const splitLabel =
            params.value && !params.value.toLowerCase().includes("self") && params.value !== "Shared Split"
              ? `Split (${params.value})`
              : "Shared Split";
          return (
            <span
              title="Multi-party shared expense with split allocation"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30 font-sans"
            >
              <Users className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="truncate">{splitLabel}</span>
            </span>
          );
        }

        return (
          <span
            title="Personal single-party expense (100% Dave Chen)"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 font-sans"
          >
            <User className="w-3 h-3 text-zinc-500 shrink-0" />
            <span>100% Self</span>
          </span>
        );
      },
    },
    {
      field: "amount",
      headerName: "Amount",
      width: 110,
      filter: "agNumberColumnFilter",
      sortable: true,
      cellRenderer: (params: ICellRendererParams<TransactionRow, number>) => (
        <span className="font-semibold text-zinc-100">
          ${Number(params.value ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      field: "status",
      headerName: "Settlement Status",
      width: 140,
      filter: true,
      cellRenderer: (params: ICellRendererParams<TransactionRow, string>) => {
        const val = params.value;
        if (val === "settled") {
          return (
            <span
              title="Settled: Payment successfully completed and cleared via PayPal Sandbox Wallet"
              className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium cursor-help"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Settled
            </span>
          );
        }
        if (val === "disputed") {
          return (
            <span
              title="Disputed: Transaction flagged for audit discrepancy or unverified surcharge"
              className="flex items-center gap-1.5 text-amber-400 text-xs font-medium cursor-help"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Disputed
            </span>
          );
        }
        return (
          <span
            title="Pending: Awaiting counterparty payment or authorization clearance"
            className="flex items-center gap-1.5 text-zinc-400 text-xs font-medium cursor-help"
          >
            <Clock className="w-3.5 h-3.5" />
            Pending
          </span>
        );
      },
    },
  ], []);

  const defaultColDef = useMemo(() => ({
    resizable: true,
    sortable: true,
  }), []);

  // Filter based on selected category pill from CategoryControlBar and AG Grid mutations
  const filteredData = useMemo(() => {
    let data = rowData;

    if (selectedCategory && selectedCategory.toLowerCase() !== "all") {
      data = data.filter(
        (row) => row.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    if (!gridMutation?.filter) return data;

    return data.filter((row) => {
      for (const [key, val] of Object.entries(gridMutation.filter!)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) continue;
        if (key === "status" && val === "unpaid") {
          if (row.status !== "pending" && row.status !== "unresolved") return false;
        } else if (key === "category") {
          if (row.category.toLowerCase() !== String(val).toLowerCase()) return false;
        } else if (Object.prototype.hasOwnProperty.call(row, key)) {
          if (row[key as keyof TransactionRow] !== val) return false;
        }
      }
      return true;
    });
  }, [rowData, gridMutation, selectedCategory]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl relative">
      {/* Top Banner / Reactive Agent Feedback */}
      <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Live Financial Ledger</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
            {filteredData.length} of {rowData.length} records
          </span>
          {selectedCategory && selectedCategory.toLowerCase() !== "all" && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/60 font-medium">
              Category: {selectedCategory}
            </span>
          )}
        </div>

        {gridMutation?.statusMessage && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-md text-xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span>{gridMutation.statusMessage}</span>
          </div>
        )}
      </div>

      {/* Grid container with modern AG Grid Theming API */}
      <div className="flex-1 w-full min-h-[380px]">
        <AgGridReact
          theme={darkTheme}
          rowData={filteredData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          animateRows={true}
          rowSelection={{ mode: "singleRow" }}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 20, 50]}
          onRowClicked={(event) => {
            if (event.data && onSelectRow) {
              onSelectRow(event.data);
            }
          }}
        />
      </div>

      {/* ========================================================================= */}
      {/* Reclassify Transaction Modal (3-Way Scope Choice with No Default)        */}
      {/* ========================================================================= */}
      {activeTxForEdit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/90">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Change Category</h3>
                  <p className="text-[11px] text-zinc-400">
                    {activeTxForEdit.merchant} • ${activeTxForEdit.amount.toFixed(2)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Category Selector */}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                  Select Target Category
                </label>
                <select
                  value={selectedNewCategory}
                  onChange={(e) => setSelectedNewCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 font-medium focus:outline-hidden focus:border-blue-500 transition-colors cursor-pointer"
                >
                  <option value="" disabled>Choose a category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} (${c.monthlyCap}/mo)
                    </option>
                  ))}
                  <option value="Uncategorized">Uncategorized</option>
                </select>
              </div>

              {/* 3 Scope Options (No Default Pre-selected) */}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-2">
                  Choose Application Scope <span className="text-amber-400">*</span>
                </label>
                <div className="space-y-2">
                  {/* Scope 1: Single */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope("single")}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      selectedScope === "single"
                        ? "bg-blue-950/40 border-blue-500 ring-1 ring-blue-500"
                        : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                      <Tag className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-100">Only this transaction</span>
                      {selectedScope === "single" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      )}
                    </div>
                  </button>

                  {/* Scope 2: Merchant */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope("merchant")}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      selectedScope === "merchant"
                        ? "bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500"
                        : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                      <Store className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-100 truncate">
                        All &apos;{activeTxForEdit.merchant}&apos; transactions
                      </span>
                      {selectedScope === "merchant" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </div>
                  </button>

                  {/* Scope 3: Similar */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope("similar")}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      selectedScope === "similar"
                        ? "bg-purple-950/40 border-purple-500 ring-1 ring-purple-500"
                        : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-100">All similar transactions</span>
                      {selectedScope === "similar" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* Feedback Alert */}
              {actionFeedback && (
                <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{actionFeedback}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 bg-zinc-900/90">
              <span className="text-[11px] text-zinc-500">
                {!selectedScope ? "Select a scope to proceed" : "Ready to apply"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReclassification}
                  disabled={!selectedNewCategory || !selectedScope || isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? "Applying..." : "Save & Apply"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
