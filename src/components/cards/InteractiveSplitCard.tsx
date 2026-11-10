"use client";

import React, { useState, useMemo } from "react";
import {
  Lock,
  Unlock,
  Trash2,
  Plus,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mail,
  Receipt,
} from "lucide-react";
import { ActionCardData } from "./ActionConfirmCard";

export interface SplitParticipantRow {
  id: string;
  name: string;
  email: string;
  amount: number;
  isHost?: boolean;
  isLocked?: boolean;
  note?: string;
}

interface InteractiveSplitCardProps {
  cardData: ActionCardData;
  onConfirm: (cardData: ActionCardData) => Promise<void>;
  onCancel: () => void;
}

export const InteractiveSplitCard: React.FC<InteractiveSplitCardProps> = ({
  cardData,
  onConfirm,
  onCancel,
}) => {
  const totalBill = cardData.totalAmount ?? 0;
  const merchantName = cardData.merchant || "Shared Expense";

  // Initialize participants from cardData
  const initialParticipants = useMemo<SplitParticipantRow[]>(() => {
    if (cardData.participants && Array.isArray(cardData.participants) && cardData.participants.length > 0) {
      return cardData.participants.map((p, idx) => ({
        id: `part_${idx}_${(p.name || "person").toLowerCase().replace(/\s+/g, "_")}`,
        name: p.name || (p.isHost ? "You" : `Person ${idx + 1}`),
        email: p.email || "",
        amount: Number(p.amount) || 0,
        isHost: Boolean(p.isHost || p.name?.toLowerCase() === "you" || p.name?.toLowerCase() === "me"),
        isLocked: Boolean(p.isLocked),
        note: p.note,
      }));
    }

    // Fallback if only recipients provided
    const rows: SplitParticipantRow[] = [];
    const recipientsSum = (cardData.recipients || []).reduce((sum, r) => sum + (r.amount || 0), 0);
    const hostShare = Math.max(0, totalBill - recipientsSum);

    rows.push({
      id: "part_host",
      name: "You",
      email: cardData.recipientEmail || "",
      amount: Number(hostShare.toFixed(2)),
      isHost: true,
      isLocked: false,
    });

    (cardData.recipients || []).forEach((r, idx) => {
      rows.push({
        id: `part_recip_${idx}`,
        name: r.name || r.email.split("@")[0] || `Friend ${idx + 1}`,
        email: r.email || "",
        amount: Number(r.amount) || 0,
        isHost: false,
        isLocked: false,
        note: r.description,
      });
    });

    return rows;
  }, [cardData, totalBill]);

  const [participants, setParticipants] = useState<SplitParticipantRow[]>(initialParticipants);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Compute live allocation sum and discrepancy
  const allocatedSum = useMemo(() => {
    const raw = participants.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return Math.round(raw * 100) / 100;
  }, [participants]);

  const remaining = useMemo(() => {
    return Math.round((totalBill - allocatedSum) * 100) / 100;
  }, [totalBill, allocatedSum]);

  const isBalanced = Math.abs(remaining) < 0.009;

  // Validation: non-host participants must have valid emails
  const invalidEmailParticipant = useMemo(() => {
    return participants.find((p) => {
      if (p.isHost) return false;
      const cleanEmail = p.email.trim();
      return !cleanEmail || !cleanEmail.includes("@") || !cleanEmail.includes(".");
    });
  }, [participants]);

  // Handlers for participant edits
  const handleUpdateName = (id: string, name: string) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  const handleUpdateEmail = (id: string, email: string) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, email: email.trim() } : p)));
  };

  const handleUpdateAmount = (id: string, rawVal: string) => {
    const num = parseFloat(rawVal) || 0;
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, amount: num } : p)));
  };

  const handleToggleLock = (id: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isLocked: !p.isLocked } : p))
    );
  };

  const handleRemoveParticipant = (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddParticipant = () => {
    const newIdx = participants.length + 1;
    setParticipants((prev) => [
      ...prev,
      {
        id: `part_new_${newIdx}_${Math.random().toString(36).slice(2, 7)}`,
        name: `Friend ${newIdx}`,
        email: "",
        amount: 0,
        isHost: false,
        isLocked: false,
      },
    ]);
  };

  // 1-Click Penny-Locked Auto-Balance Algorithm
  const handleAutoBalance = () => {
    const unlocked = participants.filter((p) => !p.isLocked);
    if (unlocked.length === 0) return;

    const lockedSum = participants
      .filter((p) => p.isLocked)
      .reduce((sum, p) => sum + p.amount, 0);

    const remainderToDistribute = Math.max(0, totalBill - lockedSum);
    const totalCents = Math.round(remainderToDistribute * 100);
    const count = unlocked.length;

    const baseCents = Math.floor(totalCents / count);
    const extraCents = totalCents % count;

    let extraAssigned = 0;
    const updated = participants.map((p) => {
      if (p.isLocked) return p;
      // Distribute extra cents to the first few unlocked rows
      const centsForThis = baseCents + (extraAssigned < extraCents ? 1 : 0);
      extraAssigned++;
      return {
        ...p,
        amount: Math.round(centsForThis) / 100,
      };
    });

    setParticipants(updated);
  };

  const handleConfirm = async () => {
    if (!isBalanced || invalidEmailParticipant) return;
    setLoading(true);

    try {
      // Build finalized recipients excluding host
      const recipients = participants
        .filter((p) => !p.isHost)
        .map((p) => ({
          name: p.name,
          email: p.email,
          amount: p.amount,
          description: p.note || `${merchantName} split share`,
        }));

      await onConfirm({
        ...cardData,
        action: "DISPATCH_INVOICES",
        totalAmount: totalBill,
        totalRecipients: recipients.length,
        recipients,
        participants: participants.map((p) => ({
          name: p.name,
          email: p.email,
          amount: p.amount,
          isHost: p.isHost,
          isLocked: p.isLocked,
          description: p.note,
        })),
      });

      setCompleted(true);
    } catch (err) {
      console.error("[Interactive Split Confirm Error]", err);
    } finally {
      setLoading(false);
    }
  };

  if (completed) {
    const nonHostCount = participants.filter((p) => !p.isHost).length;
    return (
      <div className="my-3 p-4 rounded-xl border flex items-center gap-3 bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <div className="text-sm">
          <p className="font-bold">Invoices Sent</p>
          <p className="text-xs opacity-90">
            {nonHostCount} invoice(s) sent for {merchantName}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-[var(--surface-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-border)] rounded-2xl shadow-sm transition-all text-[var(--fg-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-text)] shrink-0">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--fg-primary)] tracking-wide uppercase">
              {merchantName}
            </h4>
            <p className="text-[11px] text-[var(--fg-muted)]">
              Bill Split
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-sm font-mono tabular-nums font-bold text-[var(--fg-primary)]">
            ${totalBill.toFixed(2)}
          </span>
          <p className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider font-medium">Total</p>
        </div>
      </div>

      {/* Participant List (Editable) */}
      <div className="py-3 space-y-2 max-h-64 overflow-y-auto pr-1">
        {participants.map((p) => {
          const isMissingEmail = !p.isHost && (!p.email || !p.email.includes("@"));

          return (
            <div
              key={p.id}
              className={`p-2.5 rounded-xl border text-xs transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 ${
                p.isHost
                  ? "bg-[var(--accent-subtle)] border-[var(--accent-border)]"
                  : isMissingEmail
                  ? "bg-[var(--status-danger-bg)] border-[var(--status-danger-border)]"
                  : "theme-card-inset"
              }`}
            >
              {/* Left Column: Identity & Contact */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1 w-full sm:w-auto">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 border ${
                    p.isHost
                      ? "bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-border)]"
                      : "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)] border-[var(--status-neutral-border)]"
                  }`}
                >
                  {p.isHost ? "Host" : "Invoice"}
                </span>

                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={p.name}
                    disabled={p.isHost}
                    onChange={(e) => handleUpdateName(p.id, e.target.value)}
                    placeholder="Name"
                    className="w-full !bg-transparent !border-0 text-xs font-bold text-[var(--fg-primary)] focus:outline-none"
                  />
                  {!p.isHost && (
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-[var(--fg-muted)] shrink-0" />
                      <input
                        type="email"
                        value={p.email}
                        onChange={(e) => handleUpdateEmail(p.id, e.target.value)}
                        placeholder="email@example.com"
                        className={`w-full !bg-transparent !border-0 text-[11px] font-mono focus:outline-none ${
                          isMissingEmail
                            ? "text-[var(--status-danger-text)] placeholder:text-rose-400/70 font-medium"
                            : "text-[var(--fg-secondary)] focus:text-[var(--fg-primary)]"
                        }`}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Amount & Controls */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {/* Lock Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleLock(p.id)}
                  title={p.isLocked ? "Unlock share" : "Lock share"}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    p.isLocked
                      ? "bg-[var(--accent-subtle)] border-[var(--accent-border)] text-[var(--accent-text)] font-bold"
                      : "theme-btn-secondary"
                  }`}
                >
                  {p.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                </button>

                {/* Amount Input */}
                <div className="relative">
                  <span className="absolute left-2 top-1.5 text-[var(--fg-muted)] text-xs">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={p.amount}
                    onChange={(e) => handleUpdateAmount(p.id, e.target.value)}
                    className="w-20 pl-5 pr-2 py-1 bg-[var(--surface-card)] border border-[var(--border-strong)] focus:border-[#0070ba] rounded-lg text-xs font-mono tabular-nums font-bold text-[var(--fg-primary)] text-right focus:outline-none"
                  />
                </div>

                {/* Remove non-host */}
                {!p.isHost && (
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(p.id)}
                    className="p-1.5 text-[var(--fg-muted)] hover:text-[var(--status-danger-text)] transition-colors cursor-pointer"
                    title="Remove participant"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Participant Button */}
      <button
        type="button"
        onClick={handleAddParticipant}
        className="mt-1 w-full py-1.5 text-xs text-[var(--fg-secondary)] hover:text-[var(--accent-text)] border border-dashed border-[var(--border-strong)] hover:border-[var(--accent-border)] rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-medium bg-[var(--surface-elevated)]"
      >
        <Plus className="w-3.5 h-3.5 text-[var(--accent-text)]" />
        <span>Add Person</span>
      </button>

      {/* Live Penny-Balanced Meter & Auto-Balance Bar */}
      <div className="mt-3 p-2.5 rounded-xl theme-card-inset border flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <CheckCircle2 className="w-4 h-4 text-[var(--status-success-text)] shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
          )}

          <div>
            <span className="font-semibold text-[var(--fg-primary)] font-mono tabular-nums">
              Allocated: ${allocatedSum.toFixed(2)} / ${totalBill.toFixed(2)}
            </span>
            <p className="text-[11px] text-[var(--fg-muted)]">
              {isBalanced ? (
                <span className="text-[var(--status-success-text)] font-semibold">Balanced (100%)</span>
              ) : remaining > 0 ? (
                <span className="text-[var(--accent-text)] font-semibold">${remaining.toFixed(2)} left</span>
              ) : (
                <span className="text-[var(--status-danger-text)] font-semibold">${Math.abs(remaining).toFixed(2)} over</span>
              )}
            </p>
          </div>
        </div>

        {!isBalanced && (
          <button
            type="button"
            onClick={handleAutoBalance}
            className="px-2.5 py-1 rounded-lg bg-[var(--status-info-bg)] hover:bg-[var(--accent-subtle-hover)] text-[var(--status-info-text)] border border-[var(--status-info-border)] text-xs font-semibold transition-colors cursor-pointer"
          >
            Auto-balance
          </button>
        )}
      </div>

      {/* Missing email banner if any */}
      {invalidEmailParticipant && (
        <div className="mt-2 p-2 rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-[var(--status-danger-text)] text-[11px] flex items-center gap-2 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Enter valid email for {invalidEmailParticipant.name}.</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] rounded-lg transition-colors cursor-pointer font-medium"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading || !isBalanced || Boolean(invalidEmailParticipant)}
          className="px-4 py-2 text-xs font-bold theme-btn-primary active:scale-95 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Send Invoices</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
