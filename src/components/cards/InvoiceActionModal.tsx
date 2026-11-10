"use client";

import React, { useState } from "react";
import { X, ExternalLink, DollarSign } from "lucide-react";
import { InvoiceRecord } from "@/types/sandboxUser";

interface InvoiceActionModalProps {
  invoice: InvoiceRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onPay: (invoiceId: string) => void;
  onDecline: (invoiceId: string, reason: string) => void;
  onRequestAdjustment: (invoiceId: string, proposedAmount: number, reason: string) => void;
}

export const InvoiceActionModal: React.FC<InvoiceActionModalProps> = ({
  invoice,
  isOpen,
  onClose,
  onPay,
  onDecline,
  onRequestAdjustment,
}) => {
  const [tab, setTab] = useState<"pay" | "decline" | "adjust">("pay");
  const [declineReason, setDeclineReason] = useState("Not my expense / Sent by mistake");
  const [proposedAmount, setProposedAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");

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

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0, parseFloat(proposedAmount) || 0);
    onRequestAdjustment(invoice.id, amt, adjustmentReason.trim() || "Proposed revised share");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-amber-200/90 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-200 bg-amber-50/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-300 flex items-center justify-center text-amber-700">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900">
              PayPal Invoice: {invoice.paypalInvoiceId}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-zinc-800 p-1 rounded-lg hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Invoice Summary Box */}
        <div className="p-5 flex flex-col gap-3.5">
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/90 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-500 font-medium">From</span>
              <span className="text-xs font-semibold text-zinc-900">
                {invoice.senderName} ({invoice.senderEmail})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-500 font-medium">Description</span>
              <span className="text-xs text-zinc-800 font-medium">{invoice.description}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-stone-200">
              <span className="text-xs font-bold text-stone-700">Total Due</span>
              <span className="text-base font-bold text-emerald-700 font-mono">
                ${invoice.amount.toFixed(2)} {invoice.currency}
              </span>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex border border-stone-200 bg-stone-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setTab("pay")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === "pay"
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-2xs font-bold"
                  : "text-stone-600 hover:text-zinc-900 hover:bg-stone-200/60"
              }`}
            >
              Pay via PayPal
            </button>
            <button
              type="button"
              onClick={() => setTab("adjust")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === "adjust"
                  ? "bg-white text-zinc-900 shadow-2xs border border-stone-200"
                  : "text-stone-600 hover:text-zinc-900 hover:bg-stone-200/60"
              }`}
            >
              Propose Adjustment
            </button>
            <button
              type="button"
              onClick={() => setTab("decline")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === "decline"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "text-stone-600 hover:text-zinc-900 hover:bg-stone-200/60"
              }`}
            >
              Decline Invoice
            </button>
          </div>

          {/* Tab Content */}
          {tab === "pay" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-stone-600">
                You will be redirected to PayPal&apos;s official hosted invoice page to complete checkout in your local currency or via card/UPI.
              </p>

              <button
                type="button"
                onClick={handlePay}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all active:scale-[0.98]"
              >
                <span>Pay ${invoice.amount.toFixed(2)} on PayPal Sandbox</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {tab === "adjust" && (
            <form onSubmit={handleAdjustSubmit} className="flex flex-col gap-3">
              <p className="text-xs text-stone-600">
                If the amount is incorrect (e.g. you only had one drink or bought fewer items), propose a revised share for the sender to re-issue.
              </p>

              <div>
                <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                  Proposed Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={invoice.amount}
                  placeholder="e.g. 20.00"
                  value={proposedAmount}
                  onChange={(e) => setProposedAmount(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 font-mono focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                  Reason for Adjustment
                </label>
                <input
                  type="text"
                  placeholder="e.g. I only ordered one cocktail ($20)"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-zinc-900 border border-stone-300 text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
              >
                Submit Adjustment Request
              </button>
            </form>
          )}

          {tab === "decline" && (
            <form onSubmit={handleDeclineSubmit} className="flex flex-col gap-3">
              <p className="text-xs text-stone-600">
                Decline this invoice if it was sent by mistake or you are not responsible for this charge.
              </p>

              <div>
                <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                  Reason for Declining
                </label>
                <select
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-stone-300 text-xs text-zinc-900 focus:outline-hidden focus:border-rose-500 cursor-pointer"
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
                Confirm Decline & Notify Sender
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
