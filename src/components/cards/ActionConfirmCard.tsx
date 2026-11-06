"use client";

import React, { useState } from "react";
import { Send, CheckCircle, XCircle, Loader2 } from "lucide-react";

export interface ActionCardData {
  action: "DISPATCH_INVOICES" | string;
  totalRecipients: number;
  totalAmount: number;
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
      <div className="my-3 p-4 bg-emerald-950/30 border border-emerald-500/40 rounded-xl text-emerald-200 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-emerald-300">PayPal Invoices Dispatched</p>
          <p className="text-xs text-emerald-400/80">
            {cardData.totalRecipients} invoices totaling ${cardData.totalAmount.toFixed(2)} sent via PayPal Sandbox.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-xl transition-all">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
            Ready for Dispatch (PayPal Invoicing v2)
          </h4>
        </div>
        <span className="text-xs font-mono font-bold text-emerald-400">
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
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          <XCircle className="w-3.5 h-3.5" />
          Cancel
        </button>

        <button
          onClick={handleConfirm}
          disabled={loading}
          className="px-4 py-1.5 text-xs font-medium text-zinc-950 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 rounded-lg transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Dispatching...
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              Confirm & Send Invoices
            </>
          )}
        </button>
      </div>
    </div>
  );
};
