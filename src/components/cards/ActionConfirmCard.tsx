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
}

interface ActionConfirmCardProps {
  cardData: ActionCardData;
  categories?: Array<{ id?: string; name: string; color?: string }>;
  onConfirm: (cardData: ActionCardData) => Promise<void>;
  onCancel: () => void;
  onAssignCategory?: (
    transactionId: string,
    merchantName: string,
    targetCategory: string,
    scope: "single" | "merchant" | "similar"
  ) => Promise<{ success: boolean; message: string; updatedTransactionIds?: string[] }>;
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
  categories = [],
  onConfirm,
  onCancel,
  onAssignCategory,
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
      await onConfirm({
        ...cardData,
        category: isPayout ? selectedCategory : cardData.category,
      });
      setCompleted(isPayout ? "transferred" : "dispatched");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (isCancelled) {
    return (
      <div className="my-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/70 text-xs text-zinc-400 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <XCircle className="w-4 h-4 text-zinc-500 shrink-0" />
          <span className="font-medium text-zinc-300">Action cancelled.</span>
          <span className="text-zinc-500">No funds transferred or invoices dispatched.</span>
        </div>
      </div>
    );
  }

  // Interactive Split Breakdown Card (Gemini differential bill splitting)
  if (cardData.action === "PROPOSE_SPLIT_BREAKDOWN" || cardData.type === "split_breakdown") {
    return (
      <InteractiveSplitCard
        cardData={cardData}
        onConfirm={onConfirm}
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
        }}
        categories={categories}
        onAssignCategory={onAssignCategory}
        onCancel={handleCancel}
      />
    );
  }

  // Interactive Dispute Resolution Card (Accept, Request Difference, Reinvoke)
  if (cardData.action === "DISPUTE_RESOLUTION" || cardData.type === "dispute_resolution") {
    return (
      <DisputeResolutionCard
        cardData={cardData}
        onAccept={async (data) => {
          await onConfirm({ ...data, action: "ACCEPT_DISPUTE" });
        }}
        onRequestDifference={async (data) => {
          await onConfirm({ ...data, action: "REQUEST_DIFFERENCE" });
        }}
        onReinvokeSplit={async (data) => {
          await onConfirm({ ...data, action: "REINVOKE_SPLIT" });
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
        onConfirm={onConfirm}
        onCancel={handleCancel}
      />
    );
  }

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

  // Incoming Invoice Review Card Layout (3 Options: Pay in Full, Pay Different Value, Decline)
  if (isInvoiceReview || cardData.action === "REVIEW_INCOMING_INVOICE") {
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
        }}
        onCancel={handleCancel}
      />
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

      {/* Transfer Purpose Dropdown (for Personal / P2P Transfers) */}
      {isPayout && (
        <div className="pb-3 border-t border-zinc-800/80 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="transfer-purpose-select"
              className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5"
            >
              <span>Payment Purpose / Ledger Category</span>
            </label>
            <span className="text-[10px] text-blue-400 font-medium">Categorized on Transfer</span>
          </div>
          <select
            id="transfer-purpose-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={loading}
            className="w-full bg-zinc-950 border border-zinc-700 hover:border-zinc-600 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none transition-colors disabled:opacity-50 cursor-pointer"
          >
            {TRANSFER_PURPOSES.map((purpose) => (
              <option key={purpose} value={purpose} className="bg-zinc-900 text-zinc-100">
                {purpose}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
        <button
          onClick={handleCancel}
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
