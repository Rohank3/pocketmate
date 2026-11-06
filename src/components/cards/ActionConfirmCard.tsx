"use client";

import React, { useState } from "react";
import { Send, CheckCircle, XCircle, Loader2 } from "lucide-react";

export interface ActionCardData {
  action: "DISPATCH_INVOICES" | "DISPATCH_PAYOUT" | string;
  totalRecipients: number;
  totalAmount: number;
  recipientEmail?: string;
  amount?: number;
  note?: string;
  recipients: Array<{
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
  const [completed, setCompleted] = useState(false);

  const isPayout = cardData.action === "DISPATCH_PAYOUT";

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(cardData);
      setCompleted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (completed) {
    return (
      <div
        className={`my-3 p-4 rounded-xl border flex items-center gap-3 ${
          isPayout
            ? "bg-blue-950/30 border-blue-500/40 text-blue-200"
            : "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
        }`}
      >
        <CheckCircle className={`w-5 h-5 shrink-0 ${isPayout ? "text-blue-400" : "text-emerald-400"}`} />
        <div className="text-sm">
          <p className={`font-semibold ${isPayout ? "text-blue-300" : "text-emerald-300"}`}>
            {isPayout ? "PayPal Funds Transferred" : "PayPal Invoices Dispatched"}
          </p>
          <p className={`text-xs ${isPayout ? "text-blue-400/80" : "text-emerald-400/80"}`}>
            {isPayout
              ? `$${cardData.totalAmount.toFixed(2)} transferred to ${
                  cardData.recipientEmail || cardData.recipients?.[0]?.email
                } via PayPal Payouts API.`
              : `${cardData.totalRecipients} invoices totaling $${cardData.totalAmount.toFixed(
                  2
                )} sent via PayPal Sandbox.`}
          </p>
        </div>
      </div>
    );
  }

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
          ${cardData.totalAmount.toFixed(2)} Total
        </span>
      </div>

      {/* Recipient Itemized List */}
      <div className="py-3 space-y-2 max-h-48 overflow-y-auto">
        {cardData.recipients.map((r, i) => (
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
