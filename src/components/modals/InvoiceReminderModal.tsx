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

export const InvoiceReminderModal: React.FC<InvoiceReminderModalProps> = (props) => {
  if (!props.isOpen) return null;
  const sessionKey = `${props.debtorName}-${props.invoices.map((inv) => inv.id).join(",")}`;
  return <InvoiceReminderDialog key={sessionKey} {...props} />;
};

const InvoiceReminderDialog: React.FC<InvoiceReminderModalProps> = ({
  debtorName,
  invoices,
  onClose,
  onSuccess,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(invoices.map((inv) => inv.id))
  );
  const [customNote, setCustomNote] = useState("Friendly reminder to settle your pending shared expense via PayPal.");
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSending, onClose]);

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
      className="fixed inset-0 z-[250] bg-black/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={isSending ? undefined : onClose}
    >
      <div
        className="theme-modal rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-150 flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent Bar */}
        <div className="liquid-bar w-full" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b theme-modal-header flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 id="reminder-modal-title" className="text-sm sm:text-base font-bold text-[var(--fg-primary)]">
                Send Reminder
              </h2>
              <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                To <span className="font-semibold text-[var(--fg-primary)]">{debtorName}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSending}
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger-text)] text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-[var(--status-success-text)] text-xs flex items-start gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-medium">{successMsg}</span>
            </div>
          )}

          {/* Invoice Selection List */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--fg-secondary)]">
                Pending ({invoices.length})
              </span>
              {invoices.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[11px] font-medium text-[var(--accent-text)] hover:underline cursor-pointer"
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
                        ? "bg-[var(--accent-subtle)] border-[var(--accent-border)]"
                        : "theme-card-inset opacity-75 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        className="text-[var(--accent-text)] shrink-0"
                        aria-label={isSelected ? "Deselect invoice" : "Select invoice"}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[var(--accent-text)]" />
                        ) : (
                          <Square className="w-4 h-4 text-[var(--fg-muted)]" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--fg-primary)] truncate">
                          {inv.memo}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--fg-muted)] font-mono mt-0.5">
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
                      <span className="text-xs font-mono tabular-nums font-bold text-[var(--fg-primary)]">
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
            <label htmlFor="reminder-custom-note" className="text-xs font-semibold text-[var(--fg-secondary)]">
              Note
            </label>
            <textarea
              id="reminder-custom-note"
              rows={2}
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Optional note..."
              className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--fg-primary)] focus:outline-none focus:border-[#0070ba] focus:ring-1 focus:ring-[#0070ba] transition-colors resize-none"
            />
          </div>

          {/* Selected Total Notice */}
          <div className="p-3 rounded-xl bg-[var(--status-info-bg)] border border-[var(--status-info-border)] text-[11px] text-[var(--fg-secondary)] flex items-center justify-between">
            <span>Selected Total</span>
            <span className="font-mono tabular-nums font-bold text-xs text-[var(--status-info-text)]">
              ${totalSelectedAmount.toFixed(2)} USD
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isSending}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold theme-btn-secondary border transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSending || selectedIds.size === 0}
            onClick={handleSendReminders}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold theme-btn-primary active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Sending via PayPal...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 text-white transition-transform group-hover:translate-x-0.5" />
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
