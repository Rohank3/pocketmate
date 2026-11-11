"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  XCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
  ArrowLeft,
  User,
} from "lucide-react";

export interface InvoiceReviewCardData {
  action?: string;
  type?: string;
  invoiceId?: string;
  splitItemId?: string;
  merchant?: string;
  merchantName?: string;
  amount?: number;
  totalAmount?: number;
  currency?: string;
  senderName?: string;
  senderEmail?: string;
  memo?: string;
  paypalInvoiceUrl?: string;
}

interface InvoiceReviewCardProps {
  cardData: InvoiceReviewCardData;
  onCancel?: () => void;
  onResolved?: (resolution: {
    action: "pay" | "decline";
    reason?: string;
  }) => void;
}

export const InvoiceReviewCard: React.FC<InvoiceReviewCardProps> = ({
  cardData,
  onCancel,
  onResolved,
}) => {
  const [mode, setMode] = useState<"initial" | "decline">("initial");
  const [reason, setReason] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [resolvedStatus, setResolvedStatus] = useState<{
    action: "pay" | "decline";
    amount: number;
    reason?: string;
    message: string;
  } | null>(null);

  const originalAmount = cardData.amount ?? cardData.totalAmount ?? 0;
  const invoiceId = cardData.invoiceId || "";
  const senderName = cardData.senderName || "";
  const memo = cardData.memo || cardData.merchantName || cardData.merchant || "";
  const defaultPaypalUrl =
    cardData.paypalInvoiceUrl || (invoiceId ? `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}` : "");

  const handleResolve = async (action: "pay" | "decline", explanation?: string) => {
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/invoices/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          splitItemId: cardData.splitItemId,
          action,
          reason: explanation,
          originalAmount,
          senderName,
          senderEmail: cardData.senderEmail,
          memo,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to resolve invoice.");
      }

      const checkoutUrl = data.paypalInvoiceUrl || defaultPaypalUrl;

      if (action === "pay") {
        if (data.requiresCheckoutRedirect && checkoutUrl) {
          window.location.assign(checkoutUrl);
          return;
        }
        if (checkoutUrl) {
          window.open(checkoutUrl, "_blank", "noopener,noreferrer");
        }
        setResolvedStatus({
          action: "pay",
          amount: originalAmount,
          message: `Opened PayPal Sandbox checkout. ${senderName || "The sender"} has been notified that your invoice of $${originalAmount.toFixed(
            2
          )} is paid in full.`,
        });
      } else {
        setResolvedStatus({
          action: "decline",
          amount: originalAmount,
          reason: explanation,
          message: `Invoice declined. ${senderName || "The sender"} has been notified with your reason: "${explanation}".`,
        });
      }

      onResolved?.({ action, reason: explanation });
    } catch (err: unknown) {
      console.error("[Invoice Resolution Error]", err);
      setErrorMsg(err instanceof Error ? err.message : "Network error resolving invoice.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (resolvedStatus) {
    const isPaid = resolvedStatus.action === "pay";

    return (
      <div
        className={`my-3 p-4 rounded-xl border flex flex-col gap-2.5 transition-all animate-in fade-in ${
          isPaid
            ? "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]"
            : "bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-[var(--status-danger-text)]"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {isPaid ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 shrink-0" />
          )}
          <div className="flex-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--fg-primary)]">
              {isPaid ? "Invoice Paid" : "Invoice Declined"}
            </h4>
            <p className="text-xs mt-0.5 text-[var(--fg-secondary)]">{resolvedStatus.message}</p>
          </div>
        </div>

        {isPaid && defaultPaypalUrl && (
          <div className="mt-1 flex items-center justify-between text-[11px] theme-card-inset px-3 py-1.5 rounded-lg border">
            <span className="text-[var(--fg-muted)]">Checkout:</span>
            <a
              href={defaultPaypalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-text)] hover:underline inline-flex items-center gap-1 font-mono transition-colors font-medium"
            >
              <span>sandbox.paypal.com/invoice/...</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-[var(--surface-card)] backdrop-blur-md border border-[var(--border-subtle)] hover:border-[var(--accent-border)] rounded-2xl shadow-sm transition-all duration-300 cursor-default text-[var(--fg-primary)]">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#0070ba] animate-pulse" />
          <h4 className="text-xs font-bold text-[var(--fg-primary)] uppercase tracking-wider">
            Incoming Invoice
          </h4>
        </div>
        <span className="text-xs font-mono tabular-nums font-bold text-[var(--accent-text)]">
          ${originalAmount.toFixed(2)} Due
        </span>
      </div>

      {/* Invoice Overview Card */}
      <div className="py-3 text-xs">
        <div className="p-3 rounded-xl theme-card-inset border space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[var(--fg-primary)] text-sm">{memo || invoiceId}</span>
            <span className="text-xs font-mono tabular-nums font-bold text-[var(--fg-primary)]">
              ${originalAmount.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--fg-muted)] pt-1 border-t border-[var(--border-subtle)]">
            {senderName && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                <strong className="text-[var(--fg-primary)]">{senderName}</strong>
              </span>
            )}
            {invoiceId && <span className="font-mono">ID: {invoiceId}</span>}
            <span className="text-[var(--accent-text)] font-semibold">Pending</span>
          </div>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div className="mb-3 p-2.5 rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger-text)] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* MODE 1: Initial 2-Choice Action Selector (Pay in Full or Decline) */}
      {mode === "initial" && (
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* 1. Pay in Full */}
            <button
              type="button"
              onClick={() => handleResolve("pay")}
              disabled={isSubmitting}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--status-success-bg)] hover:brightness-105 border border-[var(--status-success-border)] text-[var(--status-success-text)] transition-all cursor-pointer text-center disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <CreditCard className="w-4 h-4" />
                <span>Pay in Full</span>
              </div>
              <span className="text-[11px] font-mono font-bold mt-0.5">
                ${originalAmount.toFixed(2)}
              </span>
            </button>

            {/* 2. Decline */}
            <button
              type="button"
              onClick={() => {
                setMode("decline");
                setErrorMsg(null);
              }}
              disabled={isSubmitting}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-[var(--status-danger-bg)] hover:brightness-105 border border-[var(--status-danger-border)] text-[var(--status-danger-text)] transition-all cursor-pointer text-center disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <XCircle className="w-4 h-4" />
                <span>Decline</span>
              </div>
              <span className="text-[11px] font-semibold mt-0.5">Request revision or reject</span>
            </button>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* MODE 2: Decline Form with Required Reason */}
      {mode === "decline" && (
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--status-danger-text)] flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />
              Decline Invoice
            </span>
            <button
              type="button"
              onClick={() => {
                setMode("initial");
                setErrorMsg(null);
              }}
              className="text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] flex items-center gap-1 cursor-pointer font-medium"
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why you're declining or what amount should be revised..."
              className="w-full bg-[var(--surface-elevated)] border border-[var(--border-strong)] focus:border-rose-500 rounded-lg px-3 py-1.5 text-xs text-[var(--fg-primary)] outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMode("initial")}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || !reason.trim()}
              onClick={() => {
                if (!reason.trim()) {
                  setErrorMsg("Enter a reason.");
                  return;
                }
                handleResolve("decline", reason.trim());
              }}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Confirm Decline</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
