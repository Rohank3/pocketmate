"use client";

import React, { useMemo, useState, useRef, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
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
import { LiquidGlassContainer } from "@/components/ui/LiquidGlassContainer";

// Register all community features (RowSelection, Pagination, ColumnFilter, NumberFilter, Validation)
ModuleRegistry.registerModules([AllCommunityModule]);

const lightGoldTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#faf9f6",
  borderColor: "#edebe4",
  foregroundColor: "#18181b",
  accentColor: "#f59e0b",
  rowHoverColor: "rgba(245, 158, 11, 0.04)",
  selectedRowBackgroundColor: "rgba(245, 158, 11, 0.08)",
  fontFamily: "inherit",
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
  direction?: "incoming" | "outgoing" | "outgoing_split";
  isOutgoingSplit?: boolean;
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
  onOpenReviewModal?: () => void;
  onClearMutation?: () => void;
}

export const TransactionGrid: React.FC<TransactionGridProps> = ({
  rowData,
  gridMutation,
  selectedCategory,
  categories = [],
  onSelectRow,
  onReclassifyTransaction,
  onOpenReviewModal,
  onClearMutation,
}) => {
  const gridRef = useRef<AgGridReact<TransactionRow>>(null);

  // Filter dismissal state to prevent user from being trapped in triage/search filter
  const [isFilterDismissed, setIsFilterDismissed] = useState<boolean>(false);
  const [lastMutationState, setLastMutationState] = useState<GridMutationState | null | undefined>(gridMutation);

  // If a new mutation is applied from agent, re-enable filter
  if (gridMutation !== lastMutationState) {
    setLastMutationState(gridMutation);
    setIsFilterDismissed(false);
  }
  // Reclassification modal state
  const [activeTxForEdit, setActiveTxForEdit] = useState<TransactionRow | null>(null);
  const [selectedNewCategory, setSelectedNewCategory] = useState<string>("");
  const [selectedScope, setSelectedScope] = useState<ReclassifyScope | null>(null); // No default!
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

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

      // Force AG Grid to refresh cells immediately with updated rowData
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ force: true });
      }

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
              <span className={`font-semibold truncate ${isDisputed ? "text-amber-800" : "text-zinc-900"}`}>
                {merchant}
              </span>
              {isDisputed && (
                <span className="shrink-0 text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-medium">
                  Dispute Flag
                </span>
              )}
            </div>
            {showMemo && (
              <span className="text-[11px] text-stone-500 font-normal truncate mt-0.5" title={memo}>
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
          Groceries: "bg-emerald-50 text-emerald-800 border-emerald-200",
          Dining: "bg-amber-50 text-amber-800 border-amber-200",
          Shopping: "bg-purple-50 text-purple-800 border-purple-200",
          Entertainment: "bg-indigo-50 text-indigo-800 border-indigo-200",
          Travel: "bg-amber-50 text-amber-900 border-amber-300",
        };
        const val = params.value || "Uncategorized";
        const isUncat = val.toLowerCase() === "uncategorized";
        const badgeClass = isUncat
          ? "bg-amber-100 text-amber-900 border-amber-300 font-medium"
          : colors[val] || "bg-stone-100 text-stone-700 border-stone-200";

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
            className={`group inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border ${badgeClass} hover:ring-1 hover:ring-amber-400 hover:brightness-105 active:scale-95 transition-all cursor-pointer`}
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
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-900 border border-amber-300/80 font-sans shadow-2xs"
            >
              <Users className="w-3 h-3 text-amber-700 shrink-0" />
              <span className="truncate">{splitLabel}</span>
            </span>
          );
        }

        return (
          <span
            title="Personal single-party expense (100% Self)"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 border border-stone-200 font-sans"
          >
            <User className="w-3 h-3 text-stone-500 shrink-0" />
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
      cellRenderer: (params: ICellRendererParams<TransactionRow, number>) => {
        const isIncome =
          params.data?.direction === "incoming" ||
          (params.data?.memo && params.data.memo.toLowerCase().includes("settlement"));
        return (
          <span
            className={`font-semibold font-mono ${
              isIncome ? "text-emerald-700 font-bold" : "text-zinc-900"
            }`}
          >
            {isIncome ? "+" : ""}${Number(params.value ?? 0).toFixed(2)}
          </span>
        );
      },
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
              className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold cursor-help"
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
              className="flex items-center gap-1.5 text-amber-800 text-xs font-semibold cursor-help"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Disputed
            </span>
          );
        }
        return (
          <span
            title="Pending: Awaiting counterparty payment or authorization clearance"
            className="flex items-center gap-1.5 text-stone-500 text-xs font-medium cursor-help"
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

    if (!gridMutation?.filter || isFilterDismissed) return data;

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
  }, [rowData, gridMutation, selectedCategory, isFilterDismissed]);

  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ force: true });
    }
  }, [filteredData]);

  return (
    <LiquidGlassContainer
      className="h-full w-full rounded-2xl"
      contentClassName="relative flex flex-col h-full overflow-hidden rounded-2xl"
      glass={{
        blur: 24,
        opacity: 0.85,
        saturation: 1.8,
        tint: "#fdfbf7",
        edge: 0.9,
        distortion: 26,
      }}
      accent="#f59e0b"
      intensity={0.85}
      rippleStrength={1}
    >
      {/* Top Banner / Reactive Agent Feedback Header */}
      <div className="px-4 py-3 bg-white/60 border-b border-stone-200/70 flex items-center justify-between backdrop-blur-md relative overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-300/80 flex items-center justify-center text-amber-700">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-bold text-zinc-900">Live Financial Ledger</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
            {filteredData.length} of {rowData.length} records
          </span>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-300 text-amber-900 text-[10px] font-bold shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>Liquid Flow Active</span>
          </div>
          {selectedCategory && selectedCategory.toLowerCase() !== "all" && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-900 border border-amber-400/50 font-medium">
              Category: {selectedCategory}
            </span>
          )}
          {(Boolean(gridMutation?.filter) && !isFilterDismissed) && (
            <button
              type="button"
              onClick={() => {
                setIsFilterDismissed(true);
                onClearMutation?.();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400 text-amber-950 text-xs font-semibold shadow-xs transition-all cursor-pointer hover:scale-105 active:scale-95"
              title="Exit triage mode and restore all transactions"
            >
              <X className="w-3.5 h-3.5 text-amber-700" />
              <span>Exit Triage / Show All</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenReviewModal &&
            rowData.some(
              (r) => r.category?.toLowerCase() === "uncategorized" || !r.category || r.category === "—"
            ) && (
              <button
                type="button"
                onClick={onOpenReviewModal}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-300/80 text-amber-900 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                title="Open interactive review and triage popup"
              >
                <Tag className="w-3.5 h-3.5 text-amber-700" />
                <span>
                  Triage (
                  {
                    rowData.filter(
                      (r) =>
                        r.category?.toLowerCase() === "uncategorized" ||
                        !r.category ||
                        r.category === "—"
                    ).length
                  }
                  ) ↗
                </span>
              </button>
            )}

          {gridMutation?.statusMessage && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span>{gridMutation.statusMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* Grid container with modern AG Grid Theming API */}
      <div className="flex-1 w-full min-h-[380px]">
        <AgGridReact
          ref={gridRef}
          theme={lightGoldTheme}
          rowData={filteredData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          animateRows={true}
          rowSelection={{ mode: "singleRow" }}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 20, 50]}
          getRowId={(params) => params.data.id}
          onRowClicked={(event) => {
            if (event.data && onSelectRow) {
              onSelectRow(event.data);
            }
          }}
        />
      </div>

      {/* ========================================================================= */}
      {/* Reclassify Transaction Modal (Portalled to document.body at z-[200])     */}
      {/* ========================================================================= */}
      {activeTxForEdit && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] bg-stone-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white/98 border border-amber-300/80 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200/80 bg-amber-50/70">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-300 flex items-center justify-center text-amber-700">
                  <Tag className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Change Category</h3>
                  <p className="text-[11px] text-stone-500">
                    {activeTxForEdit.merchant} • ${activeTxForEdit.amount.toFixed(2)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="text-stone-400 hover:text-zinc-800 p-1 rounded-lg hover:bg-stone-100 cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Category Selector */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1.5">
                  Select Target Category
                </label>
                <select
                  value={selectedNewCategory}
                  onChange={(e) => setSelectedNewCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-300 text-xs text-zinc-900 font-medium focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors cursor-pointer"
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
                <label className="text-xs font-semibold text-zinc-700 block mb-2">
                  Choose Application Scope <span className="text-amber-600">*</span>
                </label>
                <div className="space-y-2">
                  {/* Scope 1: Single */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope("single")}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      selectedScope === "single"
                        ? "bg-amber-500/10 border-amber-500 ring-1 ring-amber-500"
                        : "bg-stone-50 border-stone-200 hover:border-amber-300"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 shrink-0">
                      <Tag className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-900">Only this transaction</span>
                      {selectedScope === "single" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                    </div>
                  </button>

                  {/* Scope 2: Merchant */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope("merchant")}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      selectedScope === "merchant"
                        ? "bg-amber-500/10 border-amber-500 ring-1 ring-amber-500"
                        : "bg-stone-50 border-stone-200 hover:border-amber-300"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 shrink-0">
                      <Store className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-900 truncate">
                        All &apos;{activeTxForEdit.merchant}&apos; transactions
                      </span>
                      {selectedScope === "merchant" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                    </div>
                  </button>

                  {/* Scope 3: Similar */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope("similar")}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      selectedScope === "similar"
                        ? "bg-amber-500/10 border-amber-500 ring-1 ring-amber-500"
                        : "bg-stone-50 border-stone-200 hover:border-amber-300"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 shrink-0">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-900">All similar transactions</span>
                      {selectedScope === "similar" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* Feedback Alert */}
              {actionFeedback && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>{actionFeedback}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-stone-200 bg-stone-50">
              <span className="text-[11px] text-stone-500">
                {!selectedScope ? "Select a scope to proceed" : "Ready to apply"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-200/60 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReclassification}
                  disabled={!selectedNewCategory || !selectedScope || isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? "Applying..." : "Save & Apply"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </LiquidGlassContainer>
  );
};
