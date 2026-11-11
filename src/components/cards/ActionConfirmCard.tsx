"use client";

import React, { useState } from "react";
import { Send, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { InteractiveSplitCard } from "./InteractiveSplitCard";
import { CategoryTriageCard } from "./CategoryTriageCard";
import { InvoiceReviewCard } from "./InvoiceReviewCard";
import { DisputeResolutionCard } from "./DisputeResolutionCard";
import { SplitReconciliationCard } from "./SplitReconciliationCard";

export interface ActionCardData {
  action?: "DISPATCH_INVOICES" | "DISPATCH_PAYOUT" | "CREATE_SPLIT" | "PROPOSE_SPLIT_BREAKDOWN" | "CATEGORY_TRIAGE" | "REVIEW_INCOMING_INVOICE" | string;
  type?: string;
  category?: string;
  invoiceId?: string;
  splitItemId?: string;
  transactionId?: string;
  merchant?: string;
  merchantName?: string;
  senderName?: string;
  senderEmail?: string;
  paypalInvoiceUrl?: string;
  currency?: string;
  totalRecipients?: number;
  totalAmount?: number;
  recipientName?: string;
  recipientEmail?: string;
  amount?: number;
  note?: string;
  memo?: string;
  suggestedCategory?: string;
  confidence?: number;
  reasoning?: string;
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
  splitRecordId?: string;
  totalBill?: number;
  participants?: Array<{
    id?: string;
    name: string;
    email?: string;
    amount?: number;
    originalAmount?: number;
    amountPaid?: number;
    newShare?: number;
    isHost?: boolean;
    isLocked?: boolean;
    note?: string;
    reason?: string;
    status?: string;
  }>;
  resolvedStatus?: string;
  resolvedAction?: string;
  resolvedMessage?: string;
  resolvedCategory?: string;
  resolvedReason?: string;
}

interface ActionConfirmCardProps {
  cardData: ActionCardData;
  messageId?: string;
  categories?: Array<{ id?: string; name: string; color?: string }>;
  transactions?: Array<{ id: string; status: string; category: string }>;
  onConfirm: (cardData: ActionCardData, messageId?: string) => Promise<void>;
  onCancel: () => void;
  onAssignCategory?: (
    transactionId: string,
    merchantName: string,
    targetCategory: string,
    scope: "single" | "merchant" | "similar",
    messageId?: string
  ) => Promise<{ success: boolean; message: string; warning?: string; updatedTransactionIds?: string[] }>;
  onRequestCreateCategory?: (initialName: string) => Promise<string | null>;
  onActionCardResolved?: (messageId: string, patch: Partial<ActionCardData>) => void;
}

const TRANSFER_PURPOSES = [
  "Personal Reimbursement",
  "Dining",
  "Groceries",
  "Travel",
  "Rent",
  "Utilities",
  "Services",
  "Miscellaneous",
] as const;

export const ActionConfirmCard: React.FC<ActionConfirmCardProps> = ({
  cardData,
  messageId,
  categories = [],
  transactions = [],
  onConfirm,
  onCancel,
  onAssignCategory,
  onRequestCreateCategory,
  onActionCardResolved,
}) => {
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState<string | false>(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    cardData.category || "Personal Reimbursement"
  );

  const isPayout = cardData.action === "DISPATCH_PAYOUT";
  const isInvoiceReview = cardData.type === "incoming_invoice_review";
  const totalAmount = cardData.totalAmount ?? cardData.amount ?? 0;

  const handleCancel = () => {
    setIsCancelled(true);
    onCancel?.();
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(
        {
          ...cardData,
          category: isPayout ? selectedCategory : cardData.category,
        },
        messageId
      );
      setCompleted(isPayout ? "transferred" : "dispatched");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (isCancelled || cardData.resolvedStatus === "cancelled") {
    return (
      <div className="my-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--fg-secondary)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <XCircle className="w-4 h-4 text-[var(--fg-muted)] shrink-0" />
          <span className="font-semibold text-[var(--fg-primary)]">Cancelled</span>
        </div>
      </div>
    );
  }

  // Interactive Split Breakdown Card (Gemini differential bill splitting)
  if (cardData.action === "PROPOSE_SPLIT_BREAKDOWN" || cardData.type === "split_breakdown") {
    return (
      <InteractiveSplitCard
        cardData={cardData}
        onConfirm={(data) => onConfirm(data, messageId)}
        onCancel={handleCancel}
      />
    );
  }

  // Interactive Categorization Triage Card (3-scope one-tap selection)
  if (cardData.action === "CATEGORY_TRIAGE" || cardData.type === "category_triage") {
    return (
      <CategoryTriageCard
        cardData={{
          action: "CATEGORY_TRIAGE",
          transactionId: cardData.transactionId || cardData.invoiceId || "",
          merchantName: cardData.merchantName || cardData.merchant || "Merchant",
          amount: cardData.amount || cardData.totalAmount,
          suggestedCategory:
            cardData.suggestedCategory ||
            cardData.category ||
            (categories.length > 0 ? categories[0].name : "Uncategorized"),
          confidence: cardData.confidence,
          reasoning: cardData.reasoning || cardData.note,
          resolvedStatus: cardData.resolvedStatus,
          resolvedCategory: cardData.resolvedCategory,
          resolvedMessage: cardData.resolvedMessage,
        }}
        categories={categories}
        onAssignCategory={
          onAssignCategory
            ? (txId, merchantName, targetCat, scope) =>
                onAssignCategory(txId, merchantName, targetCat, scope, messageId)
            : undefined
        }
        onRequestCreateCategory={onRequestCreateCategory}
        onCancel={handleCancel}
        onResolved={(resolvedCategory, resolvedMessage) => {
          if (messageId) {
            onActionCardResolved?.(messageId, {
              resolvedStatus: "categorized",
              resolvedCategory,
              resolvedMessage,
            });
          }
        }}
      />
    );
  }

  // Interactive Dispute Resolution Card (Accept, Request Difference, Reinvoke)
  if (cardData.action === "DISPUTE_RESOLUTION" || cardData.type === "dispute_resolution") {
    return (
      <DisputeResolutionCard
        cardData={cardData}
        onAccept={async (data) => {
          await onConfirm({ ...data, action: "ACCEPT_DISPUTE" }, messageId);
          if (messageId) {
            onActionCardResolved?.(messageId, {
              resolvedStatus: "accepted",
              resolvedMessage: "Accepted adjusted payment.",
            });
          }
        }}
        onRequestDifference={async (data) => {
          await onConfirm({ ...data, action: "REQUEST_DIFFERENCE" }, messageId);
          if (messageId) {
            onActionCardResolved?.(messageId, {
              resolvedStatus: "requested_difference",
              resolvedMessage: "Dispatched supplemental invoice.",
            });
          }
        }}
        onReinvokeSplit={async (data) => {
          await onConfirm({ ...data, action: "REINVOKE_SPLIT" }, messageId);
        }}
        onCancel={handleCancel}
      />
    );
  }

  // Interactive Simultaneous Split Reconciliation & Rebalancing Card
  if (cardData.action === "REINVOKE_SPLIT" || cardData.type === "split_reconciliation") {
    return (
      <SplitReconciliationCard
        cardData={cardData}
        onConfirm={async (data) => {
          await onConfirm(data, messageId);
          if (messageId) {
            onActionCardResolved?.(messageId, {
              resolvedStatus: "rebalanced",
              resolvedMessage: "Split rebalanced and invoices updated.",
            });
          }
        }}
        onCancel={handleCancel}
      />
    );
  }

  const effectiveCompleted = completed || cardData.resolvedStatus || false;
  if (effectiveCompleted) {
    let successTitle = "Action Executed Successfully";
    let successDesc = cardData.resolvedMessage || `Completed action via PayPal Sandbox.`;

    if (effectiveCompleted === "transferred" || effectiveCompleted === "pay_invoice") {
      successTitle = "PayPal Payment Settled";
      if (!cardData.resolvedMessage) {
        successDesc = `$${totalAmount.toFixed(2)} settled via PayPal Sandbox Wallet.`;
      }
    } else if (effectiveCompleted === "split_invoice") {
      successTitle = "Split Prepared";
      if (!cardData.resolvedMessage) {
        successDesc = `Ready to divide invoice across group participants.`;
      }
    } else if (effectiveCompleted === "dispute_invoice") {
      successTitle = "Dispute Initiated";
      if (!cardData.resolvedMessage) {
        successDesc = `Invoice flagged under PayPal Buyer Protection.`;
      }
    } else if (effectiveCompleted === "dispatched") {
      successTitle = "PayPal Invoices Dispatched";
      if (!cardData.resolvedMessage) {
        successDesc = `${cardData.totalRecipients || cardData.recipients?.length || 1} invoice(s) sent via PayPal Sandbox.`;
      }
    }

    return (
      <div className="my-3 p-4 rounded-xl border flex items-center gap-3 bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]">
        <CheckCircle className="w-5 h-5 shrink-0" />
        <div className="text-sm">
          <p className="font-bold">{successTitle}</p>
          <p className="text-xs opacity-90">{successDesc}</p>
        </div>
      </div>
    );
  }

  // Incoming Invoice Review Card Layout (2 Options: Pay in Full, Decline)
  if (isInvoiceReview || cardData.action === "REVIEW_INCOMING_INVOICE") {
    const liveTx = cardData.invoiceId
      ? transactions.find((t) => t.id === cardData.invoiceId)
      : undefined;

    return (
      <InvoiceReviewCard
        cardData={{
          action: "REVIEW_INCOMING_INVOICE",
          type: "incoming_invoice_review",
          invoiceId: cardData.invoiceId,
          splitItemId: cardData.splitItemId,
          merchant: cardData.merchant,
          merchantName: cardData.merchantName,
          amount: totalAmount,
          totalAmount,
          currency: cardData.currency || "USD",
          senderName: cardData.senderName,
          senderEmail: cardData.senderEmail,
          memo: cardData.memo || cardData.note,
          paypalInvoiceUrl: cardData.paypalInvoiceUrl,
          resolvedStatus: cardData.resolvedStatus,
          resolvedAction: cardData.resolvedAction,
          resolvedReason: cardData.resolvedReason,
          resolvedMessage: cardData.resolvedMessage,
        }}
        liveStatus={liveTx?.status}
        onCancel={handleCancel}
        onResolved={({ action, reason }) => {
          if (messageId) {
            onActionCardResolved?.(messageId, {
              resolvedStatus: action === "pay" ? "paid" : "declined",
              resolvedAction: action,
              resolvedReason: reason,
            });
          }
        }}
      />
    );
  }

  // Standard Dispatch / Payout Card Layout
  return (
    <div
      className="my-3 p-4 bg-[var(--surface-card)] backdrop-blur-md border border-[var(--border-subtle)] hover:border-[var(--accent-border)] rounded-2xl shadow-sm transition-all duration-300 ease-out cursor-default text-[var(--fg-primary)]"
      style={{
        transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${
              isPayout ? "bg-[#0070ba]" : "bg-emerald-500"
            }`}
          />
          <h4 className="text-xs font-bold text-[var(--fg-primary)] uppercase tracking-wider">
            {isPayout ? "Transfer" : "Dispatch"}
          </h4>
        </div>
        <span
          className={`text-xs font-mono tabular-nums font-bold ${
            isPayout ? "text-[var(--accent-text)]" : "text-[var(--status-success-text)]"
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
            className="flex items-center justify-between p-2 rounded-lg theme-card-inset border text-xs"
          >
            <div>
              <span className="font-semibold text-[var(--fg-primary)]">{r.name || r.email}</span>
              <p className="text-[11px] text-[var(--fg-muted)]">{r.description}</p>
            </div>
            <span className="font-mono tabular-nums font-bold text-[var(--fg-primary)]">
              ${r.amount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Transfer Purpose Dropdown (for Personal / P2P Transfers) */}
      {isPayout && (
        <div className="pb-3 border-t border-[var(--border-subtle)] pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="transfer-purpose-select"
              className="text-[11px] font-semibold text-[var(--fg-secondary)] flex items-center gap-1.5"
            >
              <span>Purpose</span>
            </label>
          </div>
          <select
            id="transfer-purpose-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={loading}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-strong)] hover:border-[var(--accent-border)] focus:border-[#0070ba] rounded-lg px-3 py-2 text-xs text-[var(--fg-primary)] outline-none transition-colors disabled:opacity-50 cursor-pointer"
          >
            {TRANSFER_PURPOSES.map((purpose) => (
              <option key={purpose} value={purpose}>
                {purpose}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
        <button
          onClick={handleCancel}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--surface-subtle)] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer font-medium"
        >
          <XCircle className="w-3.5 h-3.5" />
          Cancel
        </button>

        <button
          onClick={handleConfirm}
          disabled={loading}
          className="px-4 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer theme-btn-primary active:scale-95"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {isPayout ? "Transferring..." : "Dispatching..."}
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              {isPayout ? "Confirm Transfer" : "Confirm & Send"}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
