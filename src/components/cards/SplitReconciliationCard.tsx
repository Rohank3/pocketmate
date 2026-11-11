"use client";

import React, { useState, useMemo } from "react";
import {
  Lock,
  Unlock,
  RotateCcw,
  Send,
  Loader2,
  CheckCircle2,
  DollarSign,
  ShieldCheck,
} from "lucide-react";
import { ActionCardData } from "./ActionConfirmCard";

export interface RebalanceParticipantRow {
  id: string;
  name: string;
  email: string;
  originalAmount: number;
  amountPaid: number;
  newShare: number;
  isHost?: boolean;
  isLocked?: boolean;
  reason?: string;
  status?: string;
}

interface SplitReconciliationCardProps {
  cardData: ActionCardData;
  onConfirm?: (cardData: ActionCardData) => Promise<void> | void;
  onCancel?: () => void;
}

export const SplitReconciliationCard: React.FC<SplitReconciliationCardProps> = ({
  cardData,
  onConfirm,
  onCancel,
}) => {
  const totalBill = cardData.totalBill ?? cardData.totalAmount ?? 480;
  const merchantName = cardData.merchant || cardData.merchantName || "Shared Bill";
  const splitRecordId = cardData.splitRecordId || "split_1";

  // Initialize participants
  const initialParticipants = useMemo<RebalanceParticipantRow[]>(() => {
    if (cardData.participants && Array.isArray(cardData.participants) && cardData.participants.length > 0) {
      return cardData.participants.map((p, idx) => ({
        id: p.id || `part_${idx}`,
        name: p.name || (p.isHost ? "You (Host)" : `Friend ${idx + 1}`),
        email: p.email || "",
        originalAmount: Number(p.originalAmount ?? p.amount ?? 0),
        amountPaid: Number(p.amountPaid ?? 0),
        newShare: Number(p.newShare ?? p.amount ?? 0),
        isHost: Boolean(p.isHost || p.name?.toLowerCase() === "you" || p.name?.toLowerCase() === "me"),
        isLocked: Boolean(p.isLocked),
        reason: p.reason,
        status: p.status,
      }));
    }
    return [];
  }, [cardData]);

  const [participants, setParticipants] = useState<RebalanceParticipantRow[]>(initialParticipants);
  const [loading, setLoading] = useState(false);
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);
  const [refundConfirmQueue, setRefundConfirmQueue] = useState<Array<{
    name: string;
    email: string;
    amount: number;
    reason: string;
  }> | null>(null);

  // Live sum of allocations
  const allocatedSum = useMemo(() => {
    const raw = participants.reduce((sum, p) => sum + (Number(p.newShare) || 0), 0);
    return Math.round(raw * 100) / 100;
  }, [participants]);

  const remaining = useMemo(() => {
    return Math.round((totalBill - allocatedSum) * 100) / 100;
  }, [totalBill, allocatedSum]);

  const isBalanced = Math.abs(remaining) < 0.009;

  // Toggle lock state on a participant
  const handleToggleLock = (id: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isLocked: !p.isLocked } : p))
    );
  };

  // Change individual participant target share
  const handleShareChange = (id: string, val: string) => {
    const num = parseFloat(val);
    const valid = isNaN(num) || num < 0 ? 0 : Math.round(num * 100) / 100;
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, newShare: valid, isLocked: true } : p))
    );
  };

  // Auto-rebalance remainder among unlocked members
  const handleAutoRebalance = () => {
    const unlocked = participants.filter((p) => !p.isLocked);
    if (unlocked.length === 0) return;

    const lockedSum = participants
      .filter((p) => p.isLocked)
      .reduce((sum, p) => sum + p.newShare, 0);

    const pool = Math.max(0, totalBill - lockedSum);
    const count = unlocked.length;
    const baseShare = Math.floor((pool / count) * 100) / 100;
    const remainderCents = Math.round((pool - baseShare * count) * 100);

    setParticipants((prev) => {
      let centsAssigned = 0;
      return prev.map((p) => {
        if (p.isLocked) return p;
        const extraCent = centsAssigned < remainderCents ? 0.01 : 0.0;
        if (extraCent > 0) centsAssigned++;
        return {
          ...p,
          newShare: Number((baseShare + extraCent).toFixed(2)),
        };
      });
    });
  };

  // Execute simultaneous rebalanced split
  const handleExecuteRebalance = async () => {
    if (!isBalanced) return;
    setLoading(true);

    try {
      const res = await fetch("/api/splits/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splitRecordId,
          totalBill,
          memo: merchantName,
          participants,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to execute split rebalance.");
      }

      if (data.refundsQueue && data.refundsQueue.length > 0) {
        setRefundConfirmQueue(data.refundsQueue);
      } else {
        setCompletedMessage(data.message || "Split rebalanced and invoices dispatched.");
        onConfirm?.({
          action: "REBALANCE_SPLIT_COMPLETED",
          splitRecordId,
          totalAmount: totalBill,
        });
      }
    } catch (err) {
      console.error("[Rebalance Execution Error]", err);
    } finally {
      setLoading(false);
    }
  };

  // Execute queued refund payouts via PayPal Payouts API
  const handleConfirmRefundPayouts = async () => {
    if (!refundConfirmQueue) return;
    setLoading(true);

    try {
      for (const ref of refundConfirmQueue) {
        await fetch("/api/paypal/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientEmail: ref.email,
            amount: ref.amount,
            note: ref.reason,
            category: "Personal Reimbursement",
            isConfirmed: true,
          }),
        });
      }
      setCompletedMessage(
        `Split rebalanced successfully! Supplemental invoices dispatched and $${refundConfirmQueue
          .reduce((s, r) => s + r.amount, 0)
          .toFixed(2)} in refund payouts transferred via PayPal.`
      );
      setRefundConfirmQueue(null);
    } catch (err) {
      console.error("[Refund Transfer Warning]", err);
      setCompletedMessage("Rebalanced split executed. Note: Some refunds may require manual clearance.");
    } finally {
      setLoading(false);
    }
  };

  const effectiveCompletedMessage =
    completedMessage ||
    (cardData.resolvedStatus === "rebalanced"
      ? cardData.resolvedMessage || `Split rebalanced for ${merchantName}.`
      : null);

  if (effectiveCompletedMessage) {
    return (
      <div className="my-3 p-4 rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-xs text-[var(--status-success-text)] flex items-center justify-between animate-in fade-in">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div>
            <h4 className="font-semibold">Split Rebalanced</h4>
            <p className="text-[11px] opacity-90 mt-0.5">{effectiveCompletedMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  // 1-Tap Authorization Card for Refund Payouts
  if (refundConfirmQueue && refundConfirmQueue.length > 0) {
    const totalRefund = refundConfirmQueue.reduce((s, r) => s + r.amount, 0);

    return (
      <div className="my-3 p-4 bg-[var(--surface-card)] border border-[var(--accent-border)] rounded-xl shadow-lg space-y-3 animate-in fade-in text-[var(--fg-primary)]">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#0070ba] animate-pulse" />
            <h4 className="text-xs font-semibold uppercase tracking-wider">
              Refund Payouts
            </h4>
          </div>
          <span className="text-xs font-mono tabular-nums font-bold text-[var(--accent-text)]">
            ${totalRefund.toFixed(2)} Refund
          </span>
        </div>

        <div className="space-y-2">
          {refundConfirmQueue.map((ref, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg theme-card-inset border flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-semibold text-[var(--fg-primary)]">{ref.name}</span>
                <p className="text-[11px] text-[var(--fg-muted)]">{ref.reason}</p>
              </div>
              <span className="font-mono tabular-nums font-bold text-[var(--accent-text)]">${ref.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setRefundConfirmQueue(null)}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmRefundPayouts}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg theme-btn-primary transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Transferring...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Send Refunds (${totalRefund.toFixed(2)})</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-[var(--surface-card)] backdrop-blur-md border border-[var(--border-subtle)] hover:border-[var(--accent-border)] rounded-2xl shadow-sm transition-all duration-300 cursor-default text-[var(--fg-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-[var(--accent-text)]" />
          <div>
            <h4 className="text-xs font-semibold text-[var(--fg-primary)] uppercase tracking-wider">
              Split Rebalancing
            </h4>
            <p className="text-[11px] text-[var(--fg-muted)]">
              {merchantName} • ${totalBill.toFixed(2)} Total
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAutoRebalance}
          className="text-[11px] px-2.5 py-1 bg-[var(--status-info-bg)] hover:bg-[var(--accent-subtle-hover)] text-[var(--status-info-text)] border border-[var(--status-info-border)] rounded-lg font-medium transition-colors cursor-pointer"
        >
          Auto-Rebalance
        </button>
      </div>

      {/* Participants Simultaneous Review List */}
      <div className="py-3 space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {participants.map((p) => {
          const delta = Math.round((p.newShare - p.amountPaid) * 100) / 100;
          const isDeclined = p.status === "CANCELLED" || (p.amountPaid === 0 && Boolean(p.reason));
          const isPartial = p.amountPaid > 0 && p.amountPaid < p.originalAmount;

          return (
            <div
              key={p.id}
              className="p-3 rounded-xl theme-card-inset border text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 border ${
                      p.isHost
                        ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[var(--accent-border)]"
                        : "bg-[var(--surface-subtle)] text-[var(--fg-secondary)] border-[var(--border-strong)]"
                    }`}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--fg-primary)] truncate">{p.name}</span>
                    <span className="text-[10px] text-[var(--fg-muted)] block truncate font-mono">
                      {p.email || (p.isHost ? "Host" : "No email")}
                    </span>
                  </div>
                </div>

                {/* Target Share Editable Input */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="relative">
                    <DollarSign className="w-3 h-3 text-[var(--fg-muted)] absolute left-2 top-2" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.newShare}
                      onChange={(e) => handleShareChange(p.id, e.target.value)}
                      className="w-20 bg-[var(--surface-card)] border border-[var(--border-strong)] focus:border-[#0070ba] rounded-lg pl-5 pr-2 py-1 text-xs text-[var(--fg-primary)] font-mono tabular-nums outline-none text-right"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleLock(p.id)}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      p.isLocked
                        ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[var(--accent-border)]"
                        : "theme-btn-secondary"
                    }`}
                    title={p.isLocked ? "Share locked" : "Lock share"}
                  >
                    {p.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Status & Computed Delta Indicator */}
              <div className="pt-1 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between text-[11px] gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--fg-muted)]">Paid:</span>
                  <span
                    className={`font-mono tabular-nums font-medium ${
                      p.amountPaid > 0 ? "text-[var(--status-success-text)]" : "text-[var(--fg-muted)]"
                    }`}
                  >
                    ${p.amountPaid.toFixed(2)}
                  </span>
                  {isDeclined && (
                    <span className="px-1.5 py-0.2 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] border border-[var(--status-danger-border)] text-[10px]">
                      Declined
                    </span>
                  )}
                  {isPartial && (
                    <span className="px-1.5 py-0.2 rounded bg-[var(--status-info-bg)] text-[var(--status-info-text)] border border-[var(--status-info-border)] text-[10px]">
                      Adjusted
                    </span>
                  )}
                </div>

                {/* Delta Action Indicator */}
                {!p.isHost && (
                  <div className="font-mono tabular-nums text-[11px]">
                    {delta > 0 && p.amountPaid > 0 ? (
                      <span className="text-[var(--accent-text)] font-medium">
                        Supplemental: +${delta.toFixed(2)}
                      </span>
                    ) : delta < 0 ? (
                      <span className="text-[var(--accent-text)] font-medium">
                        Refund: -${Math.abs(delta).toFixed(2)}
                      </span>
                    ) : isDeclined && p.newShare > 0 ? (
                      <span className="text-[var(--accent-text)] font-medium">
                        Reissue: ${p.newShare.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[var(--status-success-text)] font-medium">Settled ($0.00)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Stated Reason Callout */}
              {p.reason && (
                <div className="p-1.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[10px] text-[var(--fg-secondary)]">
                  <span className="font-semibold">Reason: </span>
                  <span className="italic">&ldquo;{p.reason}&rdquo;</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Penny-Balance Validation Bar */}
      <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono tabular-nums">
        <span className="text-[var(--fg-muted)]">
          Allocated: ${allocatedSum.toFixed(2)} / ${totalBill.toFixed(2)}
        </span>
        <span
          className={`font-semibold ${
            isBalanced ? "text-[var(--status-success-text)] flex items-center gap-1" : "text-[var(--accent-text)]"
          }`}
        >
          {isBalanced ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Balanced (100%)</span>
            </>
          ) : (
            `Diff: ${remaining > 0 ? `+$${remaining.toFixed(2)}` : `-$${Math.abs(remaining).toFixed(2)}`}`
          )}
        </span>
      </div>

      {/* Confirmation Actions */}
      <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer transition-colors"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleExecuteRebalance}
          disabled={loading || !isBalanced}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg theme-btn-primary transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Rebalancing...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Execute Rebalance</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
