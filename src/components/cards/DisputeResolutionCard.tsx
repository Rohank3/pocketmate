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
      <div className="my-3 p-3.5 rounded-xl border border-emerald-300 bg-emerald-50 text-xs text-emerald-800 flex items-center justify-between shadow-2xs animate-in fade-in">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{resultMessage}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="text-emerald-700 hover:text-emerald-900 text-[11px] cursor-pointer font-medium"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-white/80 backdrop-blur-md border border-white/90 hover:border-amber-300/80 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,0.95)] hover:shadow-[0_8px_24px_rgba(245,158,11,0.12)] transition-all duration-300 cursor-default">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
            {isDeclined ? "Invoice Declined by Debtor" : "Payment Received with Adjustment"}
          </h4>
        </div>
        <span className="text-xs font-mono font-bold text-amber-900">
          {isDeclined ? `$${origAmt.toFixed(2)} Unpaid` : `-$${diffAmt.toFixed(2)} Difference`}
        </span>
      </div>

      {/* Overview */}
      <div className="py-3 text-xs space-y-2">
        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-zinc-900 text-sm">{desc}</span>
            <span className="font-mono text-stone-700 font-semibold">
              {isDeclined ? (
                <span className="text-rose-600 font-bold">$0.00 of ${origAmt.toFixed(2)}</span>
              ) : (
                <>
                  <span className="text-emerald-700 font-bold">${adjAmt.toFixed(2)}</span>
                  <span className="text-stone-400"> / ${origAmt.toFixed(2)}</span>
                </>
              )}
            </span>
          </div>

          <div className="text-[11px] text-stone-500 pt-1 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
            <span>
              From: <strong className="text-zinc-800">{payerName}</strong> ({cardData.payerEmail || "debtor"})
            </span>
            <span className="font-mono text-stone-400">ID: {cardData.invoiceId || "INV2-..."}</span>
          </div>

          <div className="mt-1 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
            <span className="font-semibold text-amber-950">Stated Reason: </span>
            <span className="italic">&ldquo;{reason}&rdquo;</span>
          </div>
        </div>
      </div>

      {/* 3 Resolution Actions */}
      <div className="pt-2 border-t border-stone-100 space-y-2">
        <p className="text-[11px] text-stone-500 mb-1 font-medium">Select how to resolve this split:</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Action 1: Accept */}
          {!isDeclined && (
            <button
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => handleAction("accept")}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-300 text-emerald-800 transition-all cursor-pointer group text-center shadow-2xs"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Accept ${adjAmt.toFixed(0)}</span>
              </div>
              <span className="text-[10px] text-stone-500 mt-1">Absorb difference</span>
            </button>
          )}

          {/* Action 2: Request Difference */}
          {!isDeclined && diffAmt > 0 && (
            <button
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => handleAction("request_difference")}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 text-amber-900 transition-all cursor-pointer group text-center shadow-2xs"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950">
                <Send className="w-3.5 h-3.5" />
                <span>Request ${diffAmt.toFixed(2)}</span>
              </div>
              <span className="text-[10px] text-stone-500 mt-1">Supplemental invoice</span>
            </button>
          )}

          {/* Action 3: Reinvoke & Rebalance Split */}
          <button
            type="button"
            disabled={Boolean(loadingAction)}
            onClick={() => handleAction("reinvoke")}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 active:bg-stone-300 border border-stone-300 text-stone-800 transition-all cursor-pointer group text-center shadow-2xs"
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-900">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reinvoke Split</span>
            </div>
            <span className="text-[10px] text-stone-500 mt-1">Rebalance all members</span>
          </button>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onCancel || (() => setIsDismissed(true))}
            className="text-[11px] text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
