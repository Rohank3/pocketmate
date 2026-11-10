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
      <div className="my-3 p-4 rounded-xl border flex items-center gap-3 bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs">
        <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
        <div className="text-sm">
          <p className="font-bold text-emerald-900">PayPal Invoices Dispatched</p>
          <p className="text-xs text-emerald-700">
            {nonHostCount} invoice(s) sent via PayPal Sandbox for {merchantName}. Split record saved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 p-4 bg-white border border-stone-200 hover:border-amber-300 rounded-2xl shadow-xs transition-all">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0 shadow-2xs">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-zinc-900 tracking-wide uppercase">
              {merchantName}
            </h4>
            <p className="text-[11px] text-stone-500">
              Interactive Bill Split Breakdown
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-sm font-mono font-bold text-zinc-900">
            ${totalBill.toFixed(2)}
          </span>
          <p className="text-[10px] text-stone-400 uppercase tracking-wider font-medium">Total Bill</p>
        </div>
      </div>

      {/* Participant List (Editable) */}
      <div className="py-3 space-y-2 max-h-64 overflow-y-auto pr-1">
        {participants.map((p) => {
          const isMissingEmail = !p.isHost && (!p.email || !p.email.includes("@"));

          return (
            <div
              key={p.id}
              className={`p-2.5 rounded-xl border text-xs transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-2xs ${
                p.isHost
                  ? "bg-amber-50/40 border-amber-200"
                  : isMissingEmail
                  ? "bg-amber-50/70 border-amber-300"
                  : "bg-stone-50 border-stone-200"
              }`}
            >
              {/* Left Column: Identity & Contact */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1 w-full sm:w-auto">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    p.isHost
                      ? "bg-amber-100 text-amber-900 border border-amber-300"
                      : "bg-stone-100 text-stone-700 border border-stone-200"
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
                    className="w-full bg-transparent text-xs font-bold text-zinc-900 focus:outline-hidden"
                  />
                  {!p.isHost && (
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-stone-400 shrink-0" />
                      <input
                        type="email"
                        value={p.email}
                        onChange={(e) => handleUpdateEmail(p.id, e.target.value)}
                        placeholder="email@example.com"
                        className={`w-full bg-transparent text-[11px] font-mono focus:outline-hidden ${
                          isMissingEmail
                            ? "text-amber-800 placeholder-amber-600/50 font-medium"
                            : "text-stone-500 focus:text-zinc-900"
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
                  title={p.isLocked ? "Unlock to allow auto-balance" : "Lock custom amount"}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer shadow-2xs ${
                    p.isLocked
                      ? "bg-amber-100 border-amber-300 text-amber-900 font-bold"
                      : "bg-white border-stone-200 text-stone-500 hover:text-zinc-900"
                  }`}
                >
                  {p.isLocked ? <Lock className="w-3 h-3 text-amber-800" /> : <Unlock className="w-3 h-3" />}
                </button>

                {/* Amount Input */}
                <div className="relative">
                  <span className="absolute left-2 top-1.5 text-stone-400 text-xs">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={p.amount}
                    onChange={(e) => handleUpdateAmount(p.id, e.target.value)}
                    className="w-20 pl-5 pr-2 py-1 bg-white border border-stone-300 focus:border-amber-500 rounded-lg text-xs font-mono font-bold text-zinc-900 text-right focus:outline-hidden shadow-2xs"
                  />
                </div>

                {/* Remove non-host */}
                {!p.isHost && (
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(p.id)}
                    className="p-1.5 text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
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
        className="mt-1 w-full py-1.5 text-xs text-stone-600 hover:text-amber-900 border border-dashed border-stone-300 hover:border-amber-400 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-medium bg-stone-50/50"
      >
        <Plus className="w-3.5 h-3.5 text-amber-700" />
        <span>Add Person to Split</span>
      </button>

      {/* Live Penny-Balanced Meter & Auto-Balance Bar */}
      <div className="mt-3 p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          )}

          <div>
            <span className="font-semibold text-zinc-800">
              Allocated: ${allocatedSum.toFixed(2)} of ${totalBill.toFixed(2)}
            </span>
            <p className="text-[11px] text-stone-500">
              {isBalanced ? (
                <span className="text-emerald-700 font-semibold">Penny-balanced (100% matched)</span>
              ) : remaining > 0 ? (
                <span className="text-amber-800 font-semibold">${remaining.toFixed(2)} remaining to allocate</span>
              ) : (
                <span className="text-rose-600 font-semibold">${Math.abs(remaining).toFixed(2)} over total</span>
              )}
            </p>
          </div>
        </div>

        {!isBalanced && (
          <button
            type="button"
            onClick={handleAutoBalance}
            className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            Auto-balance remaining
          </button>
        )}
      </div>

      {/* Missing email banner if any */}
      {invalidEmailParticipant && (
        <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] flex items-center gap-2 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
          <span>Please enter a valid PayPal email address for {invalidEmailParticipant.name} before sending.</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-stone-500 hover:text-zinc-900 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer font-medium"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading || !isBalanced || Boolean(invalidEmailParticipant)}
          className="px-4 py-2 text-xs font-bold text-zinc-950 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 active:scale-95 rounded-xl transition-all shadow-xs border border-amber-400/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Dispatching...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Confirm & Send Invoices</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
