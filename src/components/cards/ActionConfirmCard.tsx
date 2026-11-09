"use client";

import React, { useState } from "react";
import { Send, CheckCircle, XCircle, Loader2, CreditCard, Users, ShieldAlert } from "lucide-react";

export interface ActionCardData {
  action?: "DISPATCH_INVOICES" | "DISPATCH_PAYOUT" | string;
  type?: string;
  invoiceId?: string;
  merchant?: string;
  totalRecipients?: number;
  totalAmount?: number;
  recipientName?: string;
  recipientEmail?: string;
  amount?: number;
  note?: string;
  requiresConfirmation?: boolean;
  actions?: Array<{
    label: string;
    action: string;
    variant?: "primary" | "secondary" | "danger";
  }>;
  recipients?: Array<{
    email: string;
    name?: string;
    amount: number;
    description: string;
  }>;
}

interface ActionConfirmCardProps {
  cardData: ActionCardData;
  onConfirm: (cardData: ActionCardData) => Promise<void>;
  onCancel: () => void;
}

export const ActionConfirmCard: React.FC<ActionConfirmCardProps> = ({
  cardData,
  onConfirm,
  onCancel,
}) => {
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState<string | false>(false);

  const isPayout = cardData.action === "DISPATCH_PAYOUT";
  const isInvoiceReview = cardData.type === "incoming_invoice_review";
  const totalAmount = cardData.totalAmount ?? cardData.amount ?? 0;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(cardData);
      setCompleted(isPayout ? "transferred" : "dispatched");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = async (actionType: string) => {
    setLoading(true);
    try {
      await onConfirm({ ...cardData, action: actionType });
      setCompleted(actionType);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (completed) {
    let successTitle = "Action Executed Successfully";
    let successDesc = `Completed action via PayPal Sandbox.`;

    if (completed === "transferred" || completed === "pay_invoice") {
      successTitle = "PayPal Payment Settled";
      successDesc = `$${totalAmount.toFixed(2)} settled via PayPal Sandbox Wallet.`;
    } else if (completed === "split_invoice") {
      successTitle = "Split Prepared";
      successDesc = `Ready to divide invoice across group participants.`;
    } else if (completed === "dispute_invoice") {
      successTitle = "Dispute Initiated";
      successDesc = `Invoice flagged under PayPal Buyer Protection.`;
    } else if (completed === "dispatched") {
      successTitle = "PayPal Invoices Dispatched";
      successDesc = `${cardData.totalRecipients || 1} invoice(s) sent via PayPal Sandbox.`;
    }

    return (
      <div className="my-3 p-4 rounded-xl border flex items-center gap-3 bg-emerald-950/30 border-emerald-500/40 text-emerald-200">
        <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
        <div className="text-sm">
          <p className="font-semibold text-emerald-300">{successTitle}</p>
          <p className="text-xs text-emerald-400/80">{successDesc}</p>
        </div>
      </div>
    );
  }

  // Incoming Invoice Review Card Layout
  if (isInvoiceReview) {
    return (
      <div className="my-3 p-4 bg-zinc-900 border border-blue-500/40 rounded-xl shadow-xl transition-all">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
              Incoming Invoice (PayPal Sandbox)
            </h4>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400">
            ${totalAmount.toFixed(2)} Due
          </span>
        </div>

        <div className="py-3 space-y-2 text-xs">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/40 border border-zinc-800">
            <div className="space-y-0.5">
              <span className="font-semibold text-zinc-100 text-sm">{cardData.merchant || "Merchant"}</span>
              <p className="text-[11px] text-zinc-400 font-mono">Invoice ID: {cardData.invoiceId || "INV2-..."}</p>
              <p className="text-[11px] text-zinc-400">Billed to: {cardData.recipientName || "Dave Chen"}</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold font-mono text-zinc-100">${totalAmount.toFixed(2)}</span>
              <p className="text-[10px] text-amber-400 font-medium">Pending Settlement</p>
            </div>
          </div>
        </div>

        {/* 3 Single-Tap Actions */}
        <div className="pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => handleActionClick("dispute_invoice")}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Dispute / Decline
          </button>

          <button
            onClick={() => handleActionClick("split_invoice")}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium text-blue-300 hover:text-blue-200 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            Split with Friends
          </button>

          <button
            onClick={() => handleActionClick("pay_invoice")}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-medium text-zinc-950 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 rounded-lg transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="w-3.5 h-3.5" />
                Pay via PayPal Sandbox (${totalAmount.toFixed(2)})
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Standard Dispatch / Payout Card Layout
  return (
    <div className="my-3 p-4 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-xl transition-all">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${
              isPayout ? "bg-blue-400" : "bg-emerald-400"
            }`}
          />
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
            {isPayout
              ? "Ready for Transfer (PayPal Payouts API)"
              : "Ready for Dispatch (PayPal Invoicing v2)"}
          </h4>
        </div>
        <span
          className={`text-xs font-mono font-bold ${
            isPayout ? "text-blue-400" : "text-emerald-400"
          }`}
        >
          ${totalAmount.toFixed(2)} Total
        </span>
      </div>

      {/* Recipient Itemized List */}
      <div className="py-3 space-y-2 max-h-48 overflow-y-auto">
        {(cardData.recipients || []).map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/40 border border-zinc-800 text-xs"
          >
            <div>
              <span className="font-medium text-zinc-200">{r.name || r.email}</span>
              <p className="text-[11px] text-zinc-400">{r.description}</p>
            </div>
            <span className="font-mono font-semibold text-zinc-100">
              ${r.amount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
        >
          <XCircle className="w-3.5 h-3.5" />
          Cancel
        </button>

        <button
          onClick={handleConfirm}
          disabled={loading}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors shadow-lg disabled:opacity-50 flex items-center gap-1.5 cursor-pointer ${
            isPayout
              ? "text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-blue-500/20"
              : "text-zinc-950 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 shadow-emerald-500/20"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {isPayout ? "Transferring..." : "Dispatching..."}
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              {isPayout ? "Confirm & Transfer Funds" : "Confirm & Send Invoices"}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
