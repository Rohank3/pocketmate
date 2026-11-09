"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  RotateCcw,
  Send,
} from "lucide-react";

export interface DisputeResolutionCardData {
  action?: string;
  type?: string;
  invoiceId?: string;
  splitItemId?: string;
  splitRecordId?: string;
  splitDescription?: string;
  payerName?: string;
  payerEmail?: string;
  originalAmount?: number;
  adjustedAmount?: number;
  difference?: number;
  reason?: string;
  status?: "adjusted" | "declined" | string;
}

interface DisputeResolutionCardProps {
  cardData: DisputeResolutionCardData;
  onAccept?: (cardData: DisputeResolutionCardData) => Promise<void> | void;
  onRequestDifference?: (cardData: DisputeResolutionCardData) => Promise<void> | void;
  onReinvokeSplit?: (cardData: DisputeResolutionCardData) => Promise<void> | void;
  onCancel?: () => void;
}

export const DisputeResolutionCard: React.FC<DisputeResolutionCardProps> = ({
  cardData,
  onAccept,
  onRequestDifference,
  onReinvokeSplit,
  onCancel,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  const isDeclined = cardData.status === "declined";
  const payerName = cardData.payerName || "Mark Spencer";
  const origAmt = cardData.originalAmount || 140;
  const adjAmt = cardData.adjustedAmount || 0;
  const diffAmt = cardData.difference ?? Math.max(0, origAmt - adjAmt);
  const reason = cardData.reason || "No reason specified";
  const desc = cardData.splitDescription || "Shared Expense";

  const handleAction = async (actionType: "accept" | "request_difference" | "reinvoke") => {
    setLoadingAction(actionType);
    try {
      if (actionType === "accept") {
        const res = await fetch("/api/invoices/resolve/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            splitItemId: cardData.splitItemId,
            splitRecordId: cardData.splitRecordId,
            invoiceId: cardData.invoiceId,
            action: "accept",
            differenceAmount: diffAmt,
          }),
        });
        const data = await res.json();
        setResultMessage(
          data.message ||
            `Accepted $${adjAmt.toFixed(2)} from ${payerName}. The remaining $${diffAmt.toFixed(
              2
            )} is absorbed into your host share.`
        );
        onAccept?.(cardData);
      } else if (actionType === "request_difference") {
        const res = await fetch("/api/invoices/resolve/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            splitItemId: cardData.splitItemId,
            splitRecordId: cardData.splitRecordId,
            invoiceId: cardData.invoiceId,
            action: "request_difference",
            differenceAmount: diffAmt,
            note: `Supplemental balance for ${desc}`,
          }),
        });
        const data = await res.json();
        setResultMessage(
          data.message ||
            `Dispatched supplemental invoice for $${diffAmt.toFixed(2)} to ${payerName}.`
        );
        onRequestDifference?.(cardData);
      } else if (actionType === "reinvoke") {
        setResultMessage(`Opening multi-person split reconciliation for ${desc}...`);
        onReinvokeSplit?.(cardData);
      }
    } catch (err) {
      console.error("[Dispute Action Error]", err);
      setResultMessage("Network error executing resolution action.");
    } finally {
      setLoadingAction(null);
    }
  };

  if (isDismissed) {
    return null;
  }

  if (resultMessage) {
    return (
      <div className="my-3 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-200 flex items-center justify-between shadow-md animate-in fade-in">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{resultMessage}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="text-emerald-400/70 hover:text-emerald-300 text-[11px] cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-zinc-900 border border-amber-500/40 rounded-xl shadow-xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
            {isDeclined ? "Invoice Declined by Debtor" : "Payment Received with Adjustment"}
          </h4>
        </div>
        <span className="text-xs font-mono font-bold text-amber-400">
          {isDeclined ? `$${origAmt.toFixed(2)} Unpaid` : `-$${diffAmt.toFixed(2)} Difference`}
        </span>
      </div>

      {/* Overview */}
      <div className="py-3 text-xs space-y-2">
        <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-zinc-100 text-sm">{desc}</span>
            <span className="font-mono text-zinc-300">
              {isDeclined ? (
                <span className="text-rose-400 font-bold">$0.00 of ${origAmt.toFixed(2)}</span>
              ) : (
                <>
                  <span className="text-emerald-400 font-bold">${adjAmt.toFixed(2)}</span>
                  <span className="text-zinc-500"> / ${origAmt.toFixed(2)}</span>
                </>
              )}
            </span>
          </div>

          <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60 flex flex-wrap items-center justify-between gap-2">
            <span>
              From: <strong className="text-zinc-200">{payerName}</strong> ({cardData.payerEmail || "debtor"})
            </span>
            <span className="font-mono text-zinc-500">ID: {cardData.invoiceId || "INV2-..."}</span>
          </div>

          <div className="mt-1 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
            <span className="font-semibold text-amber-200">Stated Reason: </span>
            <span className="italic">&ldquo;{reason}&rdquo;</span>
          </div>
        </div>
      </div>

      {/* 3 Resolution Actions */}
      <div className="pt-2 border-t border-zinc-800 space-y-2">
        <p className="text-[11px] text-zinc-400 mb-1">Select how to resolve this split:</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Action 1: Accept */}
          {!isDeclined && (
            <button
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => handleAction("accept")}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 active:bg-emerald-500/35 border border-emerald-500/40 text-emerald-300 transition-all cursor-pointer group text-center"
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-200 group-hover:text-white">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Accept ${adjAmt.toFixed(0)}</span>
              </div>
              <span className="text-[10px] text-zinc-400 mt-1">Absorb difference</span>
            </button>
          )}

          {/* Action 2: Request Difference */}
          {!isDeclined && diffAmt > 0 && (
            <button
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => handleAction("request_difference")}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 active:bg-blue-500/35 border border-blue-500/40 text-blue-300 transition-all cursor-pointer group text-center"
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs text-blue-200 group-hover:text-white">
                <Send className="w-3.5 h-3.5" />
                <span>Request ${diffAmt.toFixed(2)}</span>
              </div>
              <span className="text-[10px] text-zinc-400 mt-1">Supplemental invoice</span>
            </button>
          )}

          {/* Action 3: Reinvoke & Rebalance Split */}
          <button
            type="button"
            disabled={Boolean(loadingAction)}
            onClick={() => handleAction("reinvoke")}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 active:bg-purple-500/35 border border-purple-500/40 text-purple-300 transition-all cursor-pointer group text-center"
          >
            <div className="flex items-center gap-1.5 font-semibold text-xs text-purple-200 group-hover:text-white">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reinvoke Split</span>
            </div>
            <span className="text-[10px] text-zinc-400 mt-1">Rebalance all members</span>
          </button>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onCancel || (() => setIsDismissed(true))}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
