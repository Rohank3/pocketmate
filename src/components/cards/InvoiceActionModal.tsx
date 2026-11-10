"use client";

import React, { useState, useEffect } from "react";
import { X, ExternalLink, DollarSign } from "lucide-react";
import { InvoiceRecord } from "@/types/sandboxUser";

interface InvoiceActionModalProps {
  invoice: InvoiceRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onPay: (invoiceId: string) => void;
  onDecline: (invoiceId: string, reason: string) => void;
  onRequestAdjustment?: (invoiceId: string, proposedAmount: number, reason: string) => void;
}

export const InvoiceActionModal: React.FC<InvoiceActionModalProps> = ({
  invoice,
  isOpen,
  onClose,
  onPay,
  onDecline,
}) => {
  const [tab, setTab] = useState<"pay" | "decline">("pay");
  const [declineReason, setDeclineReason] = useState("Not my expense / Sent by mistake");

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !invoice) return null;

  const handlePay = () => {
    // Open PayPal Sandbox hosted checkout URL in new tab
    if (
      invoice.paypalInvoiceUrl &&
      /^https:\/\/(www\.)?(sandbox\.)?paypal\.com\//i.test(invoice.paypalInvoiceUrl)
    ) {
      window.open(invoice.paypalInvoiceUrl, "_blank", "noopener,noreferrer");
    }
    onPay(invoice.id);
    onClose();
  };

  const handleDeclineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onDecline(invoice.id, declineReason.trim() || "Declined by recipient");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="theme-modal border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b theme-modal-header">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)]">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-sm font-bold text-[var(--fg-primary)]">
              Invoice: {invoice.paypalInvoiceId}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] p-1 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Invoice Summary Box */}
        <div className="p-5 flex flex-col gap-3.5">
          <div className="p-3.5 rounded-xl theme-card-inset border flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--fg-muted)] font-medium">From</span>
              <span className="text-xs font-semibold text-[var(--fg-primary)]">
                {invoice.senderName} ({invoice.senderEmail})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--fg-muted)] font-medium">Description</span>
              <span className="text-xs text-[var(--fg-secondary)] font-medium">{invoice.description}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
              <span className="text-xs font-bold text-[var(--fg-secondary)]">Total Due</span>
              <span className="text-base font-bold text-[var(--status-success-text)] font-mono tabular-nums">
                ${invoice.amount.toFixed(2)} {invoice.currency}
              </span>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setTab("pay")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === "pay"
                  ? "theme-btn-primary font-bold"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)]"
              }`}
            >
              Pay via PayPal
            </button>
            <button
              type="button"
              onClick={() => setTab("decline")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === "decline"
                  ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border border-[var(--status-danger-border)]"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)]"
              }`}
            >
              Decline
            </button>
          </div>

          {/* Tab Content */}
          {tab === "pay" && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handlePay}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl theme-btn-primary text-xs font-bold cursor-pointer transition-all active:scale-[0.98]"
              >
                <span>Pay ${invoice.amount.toFixed(2)} on PayPal</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {tab === "decline" && (
            <form onSubmit={handleDeclineSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--fg-secondary)] block mb-1">
                  Reason
                </label>
                <select
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-card)] border border-[var(--border-strong)] text-xs text-[var(--fg-primary)] focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  <option value="Not my expense / Sent by mistake">Not my expense / Sent by mistake</option>
                  <option value="I was not present at this event">I was not present at this event</option>
                  <option value="Already settled outside of PayPal">Already settled outside of PayPal</option>
                  <option value="Duplicate invoice request">Duplicate invoice request</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer shadow-xs transition-colors"
              >
                Confirm Decline
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
