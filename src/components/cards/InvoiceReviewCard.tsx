"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Edit3,
  XCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
  ArrowLeft,
  DollarSign,
  User,
  ShieldCheck,
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
    action: "pay" | "pay_adjusted" | "decline";
    adjustedAmount?: number;
    reason?: string;
  }) => void;
}

export const InvoiceReviewCard: React.FC<InvoiceReviewCardProps> = ({
  cardData,
  onCancel,
  onResolved,
}) => {
  const [mode, setMode] = useState<"initial" | "adjust" | "decline">("initial");
  const [adjustedAmount, setAdjustedAmount] = useState<string>(
    cardData.amount ? cardData.amount.toFixed(2) : "0.00"
  );
  const [reason, setReason] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [resolvedStatus, setResolvedStatus] = useState<{
    action: "pay" | "pay_adjusted" | "decline";
    amount: number;
    reason?: string;
    message: string;
  } | null>(null);

  const originalAmount = cardData.amount ?? cardData.totalAmount ?? 0;
  const invoiceId = cardData.invoiceId || "INV2-SANDBOX";
  const senderName = cardData.senderName || "Organizer";
  const memo = cardData.memo || cardData.merchantName || cardData.merchant || "Split Expense";
  const defaultPaypalUrl =
    cardData.paypalInvoiceUrl || `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}`;

  const handleResolve = async (
    action: "pay" | "pay_adjusted" | "decline",
    customAmount?: number,
    explanation?: string
  ) => {
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
          adjustedAmount: customAmount,
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
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
        setResolvedStatus({
          action: "pay",
          amount: originalAmount,
          message: `Opened PayPal Sandbox checkout. ${senderName} has been notified that your invoice of $${originalAmount.toFixed(
            2
          )} is paid in full.`,
        });
      } else if (action === "pay_adjusted") {
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
        setResolvedStatus({
          action: "pay_adjusted",
          amount: customAmount || 0,
          reason: explanation,
          message: `Opened PayPal Sandbox checkout for $${(customAmount || 0).toFixed(
            2
          )}. ${senderName} has been notified with your reason: "${explanation}".`,
        });
      } else {
        setResolvedStatus({
          action: "decline",
          amount: originalAmount,
          reason: explanation,
          message: `Invoice declined. ${senderName} has been notified with your reason: "${explanation}".`,
        });
      }

      onResolved?.({ action, adjustedAmount: customAmount, reason: explanation });
    } catch (err: unknown) {
      console.error("[Invoice Resolution Error]", err);
      setErrorMsg(err instanceof Error ? err.message : "Network error resolving invoice.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (resolvedStatus) {
    const isPaid = resolvedStatus.action === "pay";
    const isAdjusted = resolvedStatus.action === "pay_adjusted";

    return (
      <div
        className={`my-3 p-4 rounded-xl border flex flex-col gap-2.5 transition-all animate-in fade-in ${
          isPaid || isAdjusted
            ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
            : "bg-zinc-900 border-rose-500/40 text-rose-300"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {isPaid || isAdjusted ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className="w-5 h-5 shrink-0 text-rose-400" />
          )}
          <div className="flex-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-100">
              {isPaid
                ? "PayPal Invoice Paid (Full)"
                : isAdjusted
                ? "Adjusted Payment Dispatched"
                : "Invoice Declined"}
            </h4>
            <p className="text-xs mt-0.5 text-zinc-300">{resolvedStatus.message}</p>
          </div>
        </div>

        {(isPaid || isAdjusted) && (
          <div className="mt-1 flex items-center justify-between text-[11px] bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-zinc-800">
            <span className="text-zinc-400">Checkout Link:</span>
            <a
              href={defaultPaypalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 font-mono transition-colors"
            >
              <span>sandbox.paypal.com/invoice/p/#...</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-zinc-900 border border-blue-500/40 rounded-xl shadow-xl transition-all">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
            Incoming Invoice (PayPal Sandbox)
          </h4>
        </div>
        <span className="text-xs font-mono font-bold text-emerald-400">
          ${originalAmount.toFixed(2)} Due
        </span>
      </div>

      {/* Invoice Overview Card */}
      <div className="py-3 text-xs">
        <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-zinc-100 text-sm">{memo}</span>
            <span className="text-xs font-mono font-bold text-zinc-100">
              ${originalAmount.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 text-zinc-500" />
              <span>Organizer:</span>
              <strong className="text-zinc-200">{senderName}</strong>
            </span>
            <span className="font-mono text-zinc-500">ID: {invoiceId}</span>
            <span className="text-amber-400 font-medium">Pending Settlement</span>
          </div>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: Initial 3-Choice Action Selector                                 */}
      {/* ========================================================================= */}
      {mode === "initial" && (
        <div className="pt-2 border-t border-zinc-800 space-y-2">
          <p className="text-[11px] text-zinc-400 mb-1">
            Choose how you would like to resolve this invoice:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* 1. Pay in Full */}
            <button
              type="button"
              onClick={() => handleResolve("pay")}
              disabled={isSubmitting}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 active:bg-emerald-500/35 border border-emerald-500/40 text-emerald-300 transition-all cursor-pointer group text-center"
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-200 group-hover:text-white">
                <CreditCard className="w-4 h-4" />
                <span>Pay in Full</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 mt-0.5">
                ${originalAmount.toFixed(2)}
              </span>
              <span className="text-[10px] text-zinc-400 mt-1">PayPal checkout</span>
            </button>

            {/* 2. Pay Different Value */}
            <button
              type="button"
              onClick={() => {
                setMode("adjust");
                setErrorMsg(null);
              }}
              disabled={isSubmitting}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/35 border border-amber-500/40 text-amber-300 transition-all cursor-pointer group text-center"
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-200 group-hover:text-white">
                <Edit3 className="w-4 h-4" />
                <span>Adjust Value</span>
              </div>
              <span className="text-[11px] text-amber-400/90 mt-0.5">Custom amount</span>
              <span className="text-[10px] text-zinc-400 mt-1">Specify reason</span>
            </button>

            {/* 3. Decline */}
            <button
              type="button"
              onClick={() => {
                setMode("decline");
                setErrorMsg(null);
              }}
              disabled={isSubmitting}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:bg-rose-500/35 border border-rose-500/40 text-rose-300 transition-all cursor-pointer group text-center"
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs text-rose-200 group-hover:text-white">
                <XCircle className="w-4 h-4" />
                <span>Decline</span>
              </div>
              <span className="text-[11px] text-rose-400/90 mt-0.5">Reject invoice</span>
              <span className="text-[10px] text-zinc-400 mt-1">Notify organizer</span>
            </button>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: Pay with Different Value Form                                    */}
      {/* ========================================================================= */}
      {mode === "adjust" && (
        <div className="pt-2 border-t border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5" />
              Pay with Different Value
            </span>
            <button
              type="button"
              onClick={() => {
                setMode("initial");
                setErrorMsg(null);
              }}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </button>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                Adjusted Amount (Original: ${originalAmount.toFixed(2)})
              </label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10000"
                  value={adjustedAmount}
                  onChange={(e) => setAdjustedAmount(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 focus:border-amber-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 font-mono outline-none"
                  placeholder="e.g. 100.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                Reason for Difference <span className="text-amber-400">*</span>
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Did not order drinks / stayed 1 night less..."
                className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-zinc-100 outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMode("initial")}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || !reason.trim() || parseFloat(adjustedAmount) <= 0}
              onClick={() => {
                const num = parseFloat(adjustedAmount);
                if (isNaN(num) || num <= 0) {
                  setErrorMsg("Please enter a valid dollar amount greater than $0.");
                  return;
                }
                if (!reason.trim()) {
                  setErrorMsg("Please provide an explanation reason for the adjustment.");
                  return;
                }
                handleResolve("pay_adjusted", num, reason.trim());
              }}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Proceed to PayPal (${parseFloat(adjustedAmount || "0").toFixed(2)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: Decline Form with Required Reason                                */}
      {/* ========================================================================= */}
      {mode === "decline" && (
        <div className="pt-2 border-t border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />
              Decline Invoice
            </span>
            <button
              type="button"
              onClick={() => {
                setMode("initial");
                setErrorMsg(null);
              }}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <p className="text-[11px] text-zinc-400">
              Please state why you are declining this invoice so {senderName} understands the issue:
            </p>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Already settled in cash / incorrect amount / not my charge..."
              className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-500 focus:border-rose-500 rounded-lg px-3 py-1.5 text-xs text-zinc-100 outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMode("initial")}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || !reason.trim()}
              onClick={() => {
                if (!reason.trim()) {
                  setErrorMsg("Please enter a reason for declining the invoice.");
                  return;
                }
                handleResolve("decline", undefined, reason.trim());
              }}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors shadow-lg shadow-rose-600/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
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
