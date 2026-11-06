"use client";

import React, { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  colorSchemeDark,
} from "ag-grid-community";
import { DollarSign, ShieldAlert, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { GridMutationState } from "@/types/agent";

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
  category: string;
  debtor_name: string;
  amount: number;
  status: "settled" | "pending" | "disputed" | "unresolved";
  invoiceStatus?: string;
}

interface TransactionGridProps {
  rowData: TransactionRow[];
  gridMutation?: GridMutationState | null;
  selectedCategory?: string;
  onSelectRow?: (row: TransactionRow) => void;
}

export const TransactionGrid: React.FC<TransactionGridProps> = ({
  rowData,
  gridMutation,
  selectedCategory,
}) => {
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
      flex: 1.5,
      filter: true,
      cellRenderer: (params: ICellRendererParams<TransactionRow, string>) => {
        const isDisputed = params.data?.status === "disputed";
        return (
          <div className="flex items-center gap-2">
            <span className={`font-medium ${isDisputed ? "text-amber-400 font-semibold" : "text-zinc-100"}`}>
              {params.value}
            </span>
            {isDisputed && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                Mismatch Flag
              </span>
            )}
          </div>
        );
      },
    },
    {
      field: "category",
      headerName: "Category",
      width: 120,
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
        const badgeClass = colors[val] || "bg-zinc-700/50 text-zinc-300 border-zinc-600";
        return (
          <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeClass}`}>
            {val}
          </span>
        );
      },
    },
    {
      field: "debtor_name",
      headerName: "Debtor / Split",
      width: 140,
      filter: true,
      cellRenderer: (params: ICellRendererParams<TransactionRow, string>) => (
        <span className="text-zinc-300 font-mono text-xs">
          {params.value || "—"}
        </span>
      ),
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
      cellRenderer: (params: ICellRendererParams<TransactionRow, string>) => {
        const s = params.value;
        if (s === "settled") {
          return (
            <span className="flex items-center gap-1 text-emerald-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Settled
            </span>
          );
        }
        if (s === "pending") {
          return (
            <span className="flex items-center gap-1 text-amber-400 text-xs">
              <Clock className="w-3.5 h-3.5" /> Pending Invoice
            </span>
          );
        }
        if (s === "disputed") {
          return (
            <span className="flex items-center gap-1 text-rose-400 text-xs font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" /> Discrepancy
            </span>
          );
        }
        return <span className="text-zinc-400 text-xs">Unresolved</span>;
      },
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    sortable: true,
  }), []);

  // Filter by selected category (from CategoryControlBar) and/or agent grid mutation
  const filteredData = useMemo(() => {
    let data = rowData;

    if (selectedCategory && selectedCategory.toLowerCase() !== "all") {
      const target = selectedCategory.toLowerCase();
      data = data.filter((row) => {
        const cat = row.category.toLowerCase();
        return cat === target || cat.includes(target) || target.includes(cat);
      });
    }

    if (!gridMutation?.filter) return data;

    return data.filter((row) => {
      for (const [key, val] of Object.entries(gridMutation.filter!)) {
        if (key === "status" && val === "unpaid") {
          if (row.status !== "pending" && row.status !== "unresolved") return false;
        } else if (key === "category") {
          if (row.category.toLowerCase() !== String(val).toLowerCase()) return false;
        } else if (row[key as keyof TransactionRow] !== val) {
          return false;
        }
      }
      return true;
    });
  }, [rowData, gridMutation, selectedCategory]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Banner / Reactive Agent Feedback */}
      <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Live Financial Ledger (PayPal & AG Grid)</h2>
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
        />
      </div>
    </div>
  );
};
