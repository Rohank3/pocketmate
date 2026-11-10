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
      <div className="my-3 p-3.5 rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-xs text-[var(--status-success-text)] flex items-center justify-between animate-in fade-in">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-semibold">{resultMessage}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="hover:underline text-[11px] cursor-pointer font-medium"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-[var(--surface-card)] backdrop-blur-md border border-[var(--border-subtle)] hover:border-[var(--accent-border)] rounded-2xl shadow-sm transition-all duration-300 cursor-default text-[var(--fg-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <h4 className="text-xs font-bold text-[var(--fg-primary)] uppercase tracking-wider">
            {isDeclined ? "Declined" : "Adjusted Payment"}
          </h4>
        </div>
        <span className="text-xs font-mono tabular-nums font-bold text-[var(--accent-text)]">
          {isDeclined ? `$${origAmt.toFixed(2)} Unpaid` : `-$${diffAmt.toFixed(2)} Diff`}
        </span>
      </div>

      {/* Overview */}
      <div className="py-3 text-xs space-y-2">
        <div className="p-3 rounded-xl theme-card-inset border space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[var(--fg-primary)] text-sm">{desc}</span>
            <span className="font-mono tabular-nums text-[var(--fg-secondary)] font-semibold">
              {isDeclined ? (
                <span className="text-[var(--status-danger-text)] font-bold">$0.00 / ${origAmt.toFixed(2)}</span>
              ) : (
                <>
                  <span className="text-[var(--status-success-text)] font-bold">${adjAmt.toFixed(2)}</span>
                  <span className="text-[var(--fg-muted)]"> / ${origAmt.toFixed(2)}</span>
                </>
              )}
            </span>
          </div>

          <div className="text-[11px] text-[var(--fg-muted)] pt-1 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
            <span>
              From: <strong className="text-[var(--fg-primary)]">{payerName}</strong> ({cardData.payerEmail || "debtor"})
            </span>
            <span className="font-mono text-[var(--fg-muted)]">ID: {cardData.invoiceId || "INV2-..."}</span>
          </div>

          <div className="mt-1 p-2 rounded-lg bg-[var(--status-info-bg)] border border-[var(--status-info-border)] text-[var(--status-info-text)] text-[11px]">
            <span className="font-semibold">Reason: </span>
            <span className="italic">&ldquo;{reason}&rdquo;</span>
          </div>
        </div>
      </div>

      {/* 3 Resolution Actions */}
      <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Action 1: Accept */}
          {!isDeclined && (
            <button
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => handleAction("accept")}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[var(--status-success-bg)] hover:brightness-105 border border-[var(--status-success-border)] text-[var(--status-success-text)] transition-all cursor-pointer text-center"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Accept ${adjAmt.toFixed(0)}</span>
              </div>
              <span className="text-[10px] text-[var(--fg-muted)] mt-0.5">Absorb diff</span>
            </button>
          )}

          {/* Action 2: Request Difference */}
          {!isDeclined && diffAmt > 0 && (
            <button
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => handleAction("request_difference")}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[var(--status-info-bg)] hover:bg-[var(--accent-subtle-hover)] border border-[var(--status-info-border)] text-[var(--status-info-text)] transition-all cursor-pointer text-center"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <Send className="w-3.5 h-3.5" />
                <span>Request ${diffAmt.toFixed(2)}</span>
              </div>
              <span className="text-[10px] text-[var(--fg-muted)] mt-0.5">New invoice</span>
            </button>
          )}

          {/* Action 3: Reinvoke & Rebalance Split */}
          <button
            type="button"
            disabled={Boolean(loadingAction)}
            onClick={() => handleAction("reinvoke")}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl theme-btn-secondary border transition-all cursor-pointer text-center"
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--fg-primary)]">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reinvoke</span>
            </div>
            <span className="text-[10px] text-[var(--fg-muted)] mt-0.5">Rebalance</span>
          </button>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onCancel || (() => setIsDismissed(true))}
            className="text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
