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
    if (invoice.paypalInvoiceUrl) {
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
    const amt = parseFloat(proposedAmount) || 0;
    onRequestAdjustment(invoice.id, amt, adjustmentReason.trim() || "Proposed revised share");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-zinc-100">
              PayPal Invoice: {invoice.paypalInvoiceId}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Invoice Summary Box */}
        <div className="p-5 flex flex-col gap-3.5">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">From</span>
              <span className="text-xs font-semibold text-zinc-200">
                {invoice.senderName} ({invoice.senderEmail})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Description</span>
              <span className="text-xs text-zinc-300 font-medium">{invoice.description}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
              <span className="text-xs font-semibold text-zinc-300">Total Due</span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                ${invoice.amount.toFixed(2)} {invoice.currency}
              </span>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-zinc-800 bg-zinc-950 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setTab("pay")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                tab === "pay"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Pay via PayPal
            </button>
            <button
              type="button"
              onClick={() => setTab("adjust")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                tab === "adjust"
                  ? "bg-zinc-800 text-zinc-100 shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Propose Adjustment
            </button>
            <button
              type="button"
              onClick={() => setTab("decline")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                tab === "decline"
                  ? "bg-rose-950 text-rose-300 border border-rose-800/50"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Decline Invoice
            </button>
          </div>

          {/* Tab Content */}
          {tab === "pay" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-zinc-400">
                You will be redirected to PayPal&apos;s official hosted invoice page to complete checkout in your local currency or via card/UPI.
              </p>

              <button
                type="button"
                onClick={handlePay}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#0070ba] hover:bg-[#005ea6] text-white text-xs font-semibold shadow-md shadow-blue-500/20 cursor-pointer transition-all"
              >
                <span>Pay ${invoice.amount.toFixed(2)} on PayPal Sandbox</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {tab === "adjust" && (
            <form onSubmit={handleAdjustSubmit} className="flex flex-col gap-3">
              <p className="text-xs text-zinc-400">
                If the amount is incorrect (e.g. you only had one drink or bought fewer items), propose a revised share for the sender to re-issue.
              </p>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
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
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  Reason for Adjustment
                </label>
                <input
                  type="text"
                  placeholder="e.g. I only ordered one cocktail ($20)"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold cursor-pointer transition-colors"
              >
                Submit Adjustment Request
              </button>
            </form>
          )}

          {tab === "decline" && (
            <form onSubmit={handleDeclineSubmit} className="flex flex-col gap-3">
              <p className="text-xs text-zinc-400">
                Decline this invoice if it was sent by mistake or you are not responsible for this charge.
              </p>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  Reason for Declining
                </label>
                <select
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-rose-500 cursor-pointer"
                >
                  <option value="Not my expense / Sent by mistake">Not my expense / Sent by mistake</option>
                  <option value="I was not present at this event">I was not present at this event</option>
                  <option value="Already settled outside of PayPal">Already settled outside of PayPal</option>
                  <option value="Duplicate invoice request">Duplicate invoice request</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer shadow-md shadow-rose-600/20 transition-colors"
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
