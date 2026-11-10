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
} from "lucide-react";
import { GridMutationState } from "@/types/agent";
import type { CategoryItem } from "@/components/categories/CategoryControlBar";
import { useTheme } from "@/components/theme/ThemeContext";

// Register all community features (RowSelection, Pagination, ColumnFilter, NumberFilter, Validation)
ModuleRegistry.registerModules([AllCommunityModule]);

const gridThemes: Record<string, ReturnType<typeof themeQuartz.withParams>> = {
  light: themeQuartz.withParams({
    backgroundColor: "#ffffff",
    headerBackgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    foregroundColor: "#0f172a",
    accentColor: "#0070ba",
    rowHoverColor: "rgba(0, 112, 186, 0.04)",
    selectedRowBackgroundColor: "rgba(0, 112, 186, 0.08)",
    fontFamily: "inherit",
  }),
  dark: themeQuartz.withParams({
    backgroundColor: "#0f172a",
    headerBackgroundColor: "#161f31",
    borderColor: "rgba(148, 163, 184, 0.16)",
    foregroundColor: "#f1f5f9",
    accentColor: "#38bdf8",
    rowHoverColor: "rgba(56, 189, 248, 0.07)",
    selectedRowBackgroundColor: "rgba(0, 112, 186, 0.2)",
    fontFamily: "inherit",
  }),
};

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
  const { theme, isDark } = useTheme();
  const currentGridTheme = gridThemes[theme] || gridThemes.light;
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

  useEffect(() => {
    if (!activeTxForEdit) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        setActiveTxForEdit(null);
        setSelectedNewCategory("");
        setSelectedScope(null);
        setActionFeedback(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTxForEdit, isSubmitting]);

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
              <span className={`font-semibold truncate ${isDisputed ? "text-[var(--status-danger-text)]" : "text-[var(--fg-primary)]"}`}>
                {merchant}
              </span>
              {isDisputed && (
                <span className="shrink-0 text-[10px] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border border-[var(--status-danger-border)] px-1.5 py-0.2 rounded font-medium">
                  Disputed
                </span>
              )}
            </div>
            {showMemo && (
              <span className="text-[11px] text-[var(--fg-muted)] font-normal truncate mt-0.5" title={memo}>
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
        const colorsLight: Record<string, string> = {
          Groceries: "bg-emerald-50 text-emerald-700 border-emerald-200",
          Dining: "bg-blue-50 text-[#005ea6] border-blue-200",
          Shopping: "bg-pink-50 text-pink-700 border-pink-200",
          Entertainment: "bg-indigo-50 text-indigo-700 border-indigo-200",
          Travel: "bg-sky-50 text-sky-700 border-sky-200",
          Utilities: "bg-cyan-50 text-cyan-700 border-cyan-200",
          Bills: "bg-cyan-50 text-cyan-700 border-cyan-200",
        };
        const colorsDark: Record<string, string> = {
          Groceries: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
          Dining: "bg-[#0070ba]/20 text-sky-300 border-sky-400/35",
          Shopping: "bg-pink-500/15 text-pink-300 border-pink-500/30",
          Entertainment: "bg-indigo-500/15 text-indigo-300 border-indigo-400/35",
          Travel: "bg-sky-500/15 text-sky-300 border-sky-400/30",
          Utilities: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
          Bills: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
        };
        const val = params.value || "Uncategorized";
        const isUncat = val.toLowerCase() === "uncategorized";
        const palette = isDark ? colorsDark : colorsLight;
        const badgeClass = isUncat
          ? "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)] border-[var(--status-neutral-border)] font-medium"
          : palette[val] || "bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-border)]";

        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (params.data) {
                handleOpenReclassify(params.data);
              }
            }}
            title="Change category"
            className={`group inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border ${badgeClass} hover:ring-1 hover:ring-[#0070ba] active:scale-95 transition-all cursor-pointer`}
          >
            <span>{val}</span>
            <Edit3 className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100 transition-opacity" />
          </button>
        );
      },
    },
    {
      field: "amount",
      headerName: "Amount",
      width: 120,
      filter: "agNumberColumnFilter",
      sortable: true,
      cellRenderer: (params: ICellRendererParams<TransactionRow, number>) => {
        const isIncome =
          params.data?.direction === "incoming" ||
          (params.data?.memo && params.data.memo.toLowerCase().includes("settlement"));
        return (
          <span
            className={`font-semibold font-mono tabular-nums ${
              isIncome ? "text-[var(--status-success-text)] font-bold" : "text-[var(--fg-primary)]"
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
      width: 145,
      filter: true,
      cellRenderer: (params: ICellRendererParams<TransactionRow, string>) => {
        const val = params.value;
        const isIncoming =
          params.data?.direction === "incoming" ||
          params.data?.isOutgoingSplit === true;

        if (val === "settled" || val === "COMPLETED") {
          if (isIncoming) {
            return (
              <span
                title="Payment received"
                className="flex items-center gap-1.5 text-[var(--status-success-text)] text-xs font-semibold cursor-help"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Received
              </span>
            );
          }
          return (
            <span
              title="Payment completed"
              className="flex items-center gap-1.5 text-[var(--status-success-text)] text-xs font-semibold cursor-help"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Paid
            </span>
          );
        }
        if (val === "disputed" || val === "DISPUTED") {
          return (
            <span
              title="Flagged dispute"
              className="flex items-center gap-1.5 text-[var(--status-danger-text)] text-xs font-semibold cursor-help"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Disputed
            </span>
          );
        }
        if (isIncoming) {
          return (
            <span
              title="Pending reimbursement"
              className="flex items-center gap-1.5 text-[var(--status-info-text)] text-xs font-medium cursor-help"
            >
              <Clock className="w-3.5 h-3.5" />
              To receive
            </span>
          );
        }
        return (
          <span
            title="Payment due"
            className="flex items-center gap-1.5 text-[var(--fg-secondary)] text-xs font-medium cursor-help"
          >
            <Clock className="w-3.5 h-3.5" />
            To send
          </span>
        );
      },
    },
  ], [isDark]);

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
    <div className="h-full w-full flex flex-col rounded-2xl overflow-hidden bg-transparent relative">
      {/* Top Banner / Reactive Agent Feedback Header */}
      <div className="px-4 py-3 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between backdrop-blur-md relative overflow-hidden rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-bold text-[var(--fg-primary)]">Live Financial Ledger</h2>
          <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-[var(--surface-subtle)] text-[var(--fg-secondary)] border border-[var(--border-subtle)]">
            {filteredData.length} of {rowData.length} records
          </span>
          {selectedCategory && selectedCategory.toLowerCase() !== "all" && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--status-info-bg)] text-[var(--status-info-text)] border border-[var(--status-info-border)] font-medium">
              {selectedCategory}
            </span>
          )}
          {(Boolean(gridMutation?.filter) && !isFilterDismissed) && (
            <button
              type="button"
              onClick={() => {
                setIsFilterDismissed(true);
                onClearMutation?.();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[var(--status-info-bg)] hover:bg-[var(--accent-subtle-hover)] border border-[var(--status-info-border)] text-[var(--status-info-text)] text-xs font-semibold transition-all cursor-pointer active:scale-95"
              title="Exit triage mode"
            >
              <X className="w-3.5 h-3.5" />
              <span>Exit Triage</span>
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
                className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--status-info-bg)] hover:bg-[var(--accent-subtle-hover)] border border-[var(--status-info-border)] text-[var(--status-info-text)] rounded-lg text-xs font-semibold transition-all cursor-pointer"
                title="Open triage popup"
              >
                <Tag className="w-3.5 h-3.5" />
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
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--status-info-bg)] border border-[var(--status-info-border)] text-[var(--status-info-text)] rounded-lg text-xs">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>{gridMutation.statusMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* Grid container with modern AG Grid Theming API */}
      <div className="flex-1 w-full min-h-[380px]">
        <AgGridReact
          ref={gridRef}
          theme={currentGridTheme}
          rowData={filteredData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          animateRows={true}
          rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
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
      {/* Reclassify Transaction Modal                                              */}
      {/* ========================================================================= */}
      {activeTxForEdit && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={handleCloseModal}
        >
          <div
            className="theme-modal border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b theme-modal-header">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]">
                  <Tag className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--fg-primary)]">Change Category</h3>
                  <p className="text-[11px] text-[var(--fg-muted)] font-mono tabular-nums">
                    {activeTxForEdit.merchant} • ${activeTxForEdit.amount.toFixed(2)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                aria-label="Close modal"
                className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] p-1 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Category Selector */}
              <div>
                <label className="text-xs font-semibold text-[var(--fg-secondary)] block mb-1.5">
                  Category
                </label>
                <select
                  value={selectedNewCategory}
                  onChange={(e) => setSelectedNewCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--surface-card)] border border-[var(--border-strong)] text-xs text-[var(--fg-primary)] font-medium focus:outline-none focus:border-[#0070ba] focus:ring-1 focus:ring-[#0070ba] transition-colors cursor-pointer"
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

              {/* 3 Scope Options */}
              <div>
                <label className="text-xs font-semibold text-[var(--fg-secondary)] block mb-2">
                  Apply Scope <span className="text-[var(--accent-text)]">*</span>
                </label>
                <div className="space-y-2">
                  {/* Scope 1: Single */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope("single")}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      selectedScope === "single"
                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] ring-1 ring-[#0070ba]"
                        : "theme-card-inset hover:border-[var(--accent-border)]"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent-text)] shrink-0">
                      <Tag className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--fg-primary)]">Only this transaction</span>
                      {selectedScope === "single" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
                      )}
                    </div>
                  </button>

                  {/* Scope 2: Merchant */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope("merchant")}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      selectedScope === "merchant"
                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] ring-1 ring-[#0070ba]"
                        : "theme-card-inset hover:border-[var(--accent-border)]"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent-text)] shrink-0">
                      <Store className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--fg-primary)] truncate">
                        All &apos;{activeTxForEdit.merchant}&apos;
                      </span>
                      {selectedScope === "merchant" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
                      )}
                    </div>
                  </button>

                  {/* Scope 3: Similar */}
                  <button
                    type="button"
                    onClick={() => setSelectedScope("similar")}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                      selectedScope === "similar"
                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] ring-1 ring-[#0070ba]"
                        : "theme-card-inset hover:border-[var(--accent-border)]"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent-text)] shrink-0">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--fg-primary)]">All similar</span>
                      {selectedScope === "similar" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* Feedback Alert */}
              {actionFeedback && (
                <div className="p-2.5 rounded-lg bg-[var(--status-info-bg)] border border-[var(--status-info-border)] text-xs text-[var(--status-info-text)] flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{actionFeedback}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <span className="text-[11px] text-[var(--fg-muted)]">
                {!selectedScope ? "Select scope" : "Ready"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--fg-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReclassification}
                  disabled={!selectedNewCategory || !selectedScope || isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg theme-btn-primary text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
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
    </div>
  );
};
