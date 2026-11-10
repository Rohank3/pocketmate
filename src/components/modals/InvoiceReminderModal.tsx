"use client";

import React, { useState, useEffect } from "react";
import { X, Send, CheckCircle2, AlertCircle, Clock, CheckSquare, Square, Loader2 } from "lucide-react";

export interface PendingInvoiceItem {
  id: string;
  amount: number;
  memo: string;
  date?: string;
}

export interface InvoiceReminderModalProps {
  isOpen: boolean;
  debtorName: string;
  invoices: PendingInvoiceItem[];
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export const InvoiceReminderModal: React.FC<InvoiceReminderModalProps> = ({
  isOpen,
  debtorName,
  invoices,
  onClose,
  onSuccess,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customNote, setCustomNote] = useState("Friendly reminder to settle your pending shared expense via PayPal.");
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Initialize selected IDs whenever invoices change or modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)));
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, invoices]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSending, onClose]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)));
    }
  };

  const handleSendReminders = async () => {
    if (selectedIds.size === 0) return;

    setIsSending(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const idsToSend = Array.from(selectedIds);
    let successCount = 0;
    let lastError = "";

    for (const invId of idsToSend) {
      try {
        const res = await fetch("/api/paypal/invoices/remind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: invId,
            note: customNote.trim() || undefined,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          successCount++;
        } else {
          lastError = data.error || `Failed to remind invoice ${invId}`;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Network error";
      }
    }

    setIsSending(false);

    if (successCount > 0) {
      const msg = `Dispatched ${successCount} PayPal Sandbox reminder${successCount > 1 ? "s" : ""} to ${debtorName}.`;
      setSuccessMsg(msg);
      if (onSuccess) onSuccess(msg);
      setTimeout(() => {
        onClose();
      }, 1600);
    } else {
      setErrorMsg(lastError || "Could not dispatch reminders via PayPal Sandbox.");
    }
  };

  const totalSelectedAmount = invoices
    .filter((inv) => selectedIds.has(inv.id))
    .reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-modal-title"
      className="fixed inset-0 z-[250] bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={isSending ? undefined : onClose}
    >
      <div
        className="bg-white/98 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-amber-300/80 animate-in zoom-in-95 duration-150 flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200 flex items-start justify-between gap-3 bg-stone-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center shrink-0 shadow-2xs">
              <Send className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h2 id="reminder-modal-title" className="text-sm sm:text-base font-bold text-zinc-900">
                Send PayPal Reminder
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Dispatch an official reminder via PayPal Sandbox to{" "}
                <span className="font-semibold text-zinc-800">{debtorName}</span>.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSending}
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span className="font-medium">{successMsg}</span>
            </div>
          )}

          {/* Invoice Selection List */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-800">
                Pending Invoices ({invoices.length})
              </span>
              {invoices.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[11px] font-medium text-amber-700 hover:text-amber-800 cursor-pointer"
                >
                  {selectedIds.size === invoices.length ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
              {invoices.map((inv) => {
                const isSelected = selectedIds.has(inv.id);
                return (
                  <div
                    key={inv.id}
                    onClick={() => toggleSelect(inv.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-amber-50/70 border-amber-300 shadow-2xs"
                        : "bg-white border-stone-200 hover:border-stone-300 opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        className="text-amber-700 shrink-0"
                        aria-label={isSelected ? "Deselect invoice" : "Select invoice"}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-amber-700" />
                        ) : (
                          <Square className="w-4 h-4 text-stone-400" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-900 truncate">
                          {inv.memo}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-stone-500 font-mono mt-0.5">
                          <span className="truncate">{inv.id}</span>
                          {inv.date && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {inv.date}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-zinc-900">
                        ${inv.amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Reminder Message */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reminder-custom-note" className="text-xs font-semibold text-zinc-800">
              Reminder Message
            </label>
            <textarea
              id="reminder-custom-note"
              rows={2}
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Add an optional personal note..."
              className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white text-zinc-900 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors shadow-2xs resize-none"
            />
          </div>

          {/* Sandbox Info Notice */}
          <div className="p-3 rounded-xl bg-amber-50/40 border border-amber-200 text-[11px] text-stone-600 flex items-center justify-between">
            <span>Selected Total</span>
            <span className="font-mono font-bold text-xs text-amber-900">
              ${totalSelectedAmount.toFixed(2)} USD
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isSending}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-stone-200/70 border border-stone-300 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSending || selectedIds.size === 0}
            onClick={handleSendReminders}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-zinc-950 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-950" />
                <span>Sending via PayPal...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 text-zinc-950 transition-transform group-hover:translate-x-0.5" />
                <span>
                  Send Reminder ({selectedIds.size})
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
