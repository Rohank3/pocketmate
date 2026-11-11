import { NextRequest, NextResponse } from "next/server";
import { runAgentOrchestrator } from "@/lib/agent/orchestrator";
import { executeAgentTool } from "@/lib/agent/tools";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { markChatActionCardsResolved, persistChatMessage } from "@/lib/agent/dbSync";
import { z } from "zod";

const ActionToConfirmSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("DISPATCH_INVOICES"),
    recipients: z
      .array(
        z.object({
          email: z.string().trim().email().max(255),
          name: z.string().trim().max(100).optional(),
          amount: z.number().finite().positive().max(50000),
          description: z.string().trim().min(1).max(255),
        })
      )
      .min(1)
      .max(50),
    category: z.string().trim().max(100).optional(),
    sourceTransactionId: z.string().trim().max(100).optional(),
    transactionId: z.string().trim().max(100).optional(),
    merchant: z.string().trim().max(100).optional(),
  }),
  z.object({
    action: z.literal("PROPOSE_SPLIT_BREAKDOWN"),
    recipients: z
      .array(
        z.object({
          email: z.string().trim().email().max(255),
          name: z.string().trim().max(100).optional(),
          amount: z.number().finite().positive().max(50000),
          description: z.string().trim().min(1).max(255),
        })
      )
      .min(1)
      .max(50),
    participants: z.array(z.record(z.string(), z.unknown())).optional(),
    totalAmount: z.number().optional(),
    merchant: z.string().optional(),
    category: z.string().trim().max(100).optional(),
    sourceTransactionId: z.string().trim().max(100).optional(),
    transactionId: z.string().trim().max(100).optional(),
  }),
  z.object({
    action: z.literal("DISPATCH_PAYOUT"),
    recipientEmail: z.string().trim().email().max(255).optional(),
    recipients: z
      .array(
        z.object({
          email: z.string().trim().email().max(255),
          description: z.string().trim().max(255).optional(),
        })
      )
      .optional(),
    amount: z.number().finite().positive().max(50000).optional(),
    totalAmount: z.number().finite().positive().max(50000).optional(),
    note: z.string().trim().max(255).optional(),
    category: z.string().trim().max(50).optional(),
  }),
  z.object({
    action: z.literal("pay_invoice"),
    invoiceId: z.string().optional(),
    amount: z.number().optional(),
    merchant: z.string().optional(),
  }),
  z.object({
    action: z.literal("split_invoice"),
    invoiceId: z.string().optional(),
    amount: z.number().optional(),
    merchant: z.string().optional(),
  }),
  z.object({
    action: z.literal("dispute_invoice"),
    invoiceId: z.string().optional(),
    amount: z.number().optional(),
    merchant: z.string().optional(),
  }),
]);

const AgentPayloadSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(10000),
      })
    )
    .min(1)
    .max(50)
    .optional(),
  persona: z.enum(["GENERAL", "FREELANCER", "BUSINESS"]).default("GENERAL"),
  actionToConfirm: ActionToConfirmSchema.optional(),
  messageId: z.string().trim().max(100).optional(),
  threadId: z.string().trim().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = AgentPayloadSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { messages, persona, actionToConfirm, messageId, threadId } = parseResult.data;
    const authenticatedUser = await getAuthenticatedUser(req);
    if (!authenticatedUser) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required." },
        { status: 401 }
      );
    }
    const userId = authenticatedUser.id;

    const finalizeConfirmedAction = async (
      resolvedStatus: string,
      reply: string,
      executedTools: Array<{ name: string; args: unknown; result: unknown }>
    ) => {
      await markChatActionCardsResolved({
        userId,
        messageId,
        match: (card) => {
          if (card.resolvedStatus) return false;
          if (
            actionToConfirm?.action === "DISPATCH_INVOICES" ||
            actionToConfirm?.action === "PROPOSE_SPLIT_BREAKDOWN"
          ) {
            return (
              card.action === "DISPATCH_INVOICES" ||
              card.action === "PROPOSE_SPLIT_BREAKDOWN" ||
              card.type === "split_breakdown"
            );
          }
          return card.action === actionToConfirm?.action;
        },
        resolution: {
          resolvedStatus,
          resolvedMessage: reply,
        },
      });

      const persistedMessageId = threadId
        ? await persistChatMessage("assistant", reply, persona, undefined, userId, threadId)
        : undefined;

      return NextResponse.json({
        reply,
        actionCard: null,
        persistedMessageId,
        executedTools,
      });
    };

    // Handle single-tap confirmation of an action card (Layer D)
    if (actionToConfirm && (actionToConfirm.action === "DISPATCH_INVOICES" || actionToConfirm.action === "PROPOSE_SPLIT_BREAKDOWN")) {
      const dispatchResult = await executeAgentTool(
        "dispatch_paypal_invoices",
        {
          recipients: actionToConfirm.recipients,
          category: actionToConfirm.category,
          sourceTransactionId:
            actionToConfirm.sourceTransactionId || actionToConfirm.transactionId,
          merchantName: actionToConfirm.merchant,
          isConfirmed: true,
        },
        userId,
        true
      );

      return finalizeConfirmedAction(
        "dispatched",
        `✅ Successfully dispatched ${dispatchResult.dispatchedCount} PayPal invoices via Sandbox API.`,
        [{ name: "dispatch_paypal_invoices", args: actionToConfirm, result: dispatchResult }]
      );
    }

    if (actionToConfirm && actionToConfirm.action === "DISPATCH_PAYOUT") {
      const recipientEmail = actionToConfirm.recipientEmail || actionToConfirm.recipients?.[0]?.email;
      const amount = actionToConfirm.amount || actionToConfirm.totalAmount;
      const note = actionToConfirm.note || actionToConfirm.recipients?.[0]?.description || "Direct Settlement via PocketMate";

      if (!recipientEmail || !amount) {
        return NextResponse.json(
          { error: "recipientEmail and a valid amount are required to dispatch payout." },
          { status: 400 }
        );
      }

      const payoutResult = await executeAgentTool(
        "send_direct_payout",
        {
          recipientEmail,
          amount,
          note,
          category: actionToConfirm.category,
          isConfirmed: true,
        },
        userId,
        true
      );

      return finalizeConfirmedAction(
        "transferred",
        `✅ Successfully transferred $${Number(amount).toFixed(2)} to ${recipientEmail} via PayPal Payouts API.`,
        [{ name: "send_direct_payout", args: actionToConfirm, result: payoutResult }]
      );
    }

    if (actionToConfirm && actionToConfirm.action === "pay_invoice") {
      const amt = Number(actionToConfirm.amount || 0);
      const invId = actionToConfirm.invoiceId || "Invoice";
      return finalizeConfirmedAction(
        "pay_invoice",
        `✅ Payment of **$${amt.toFixed(2)} USD** for invoice \`${invId}\` has been successfully settled via your PayPal Sandbox Wallet. Your ledger and budget have been updated.`,
        []
      );
    }

    if (actionToConfirm && actionToConfirm.action === "split_invoice") {
      const amt = Number(actionToConfirm.amount || 0);
      const invId = actionToConfirm.invoiceId || "Invoice";
      const merchant = actionToConfirm.merchant || "Merchant";
      return finalizeConfirmedAction(
        "split_invoice",
        `Group split initiated for invoice \`${invId}\` (**$${amt.toFixed(2)}** from **${merchant}**).\n\nWho would you like to split this with? Reply with the participants (e.g. *"split this charge 3 ways with Alex and Sam"*).`,
        []
      );
    }

    if (actionToConfirm && actionToConfirm.action === "dispute_invoice") {
      const invId = actionToConfirm.invoiceId || "Invoice";
      const merchant = actionToConfirm.merchant || "Merchant";
      return finalizeConfirmedAction(
        "dispute_invoice",
        `🛡️ **PayPal Dispute Filed**: Invoice \`${invId}\` for **${merchant}** has been flagged under PayPal Sandbox Buyer Protection for billing discrepancy review.`,
        []
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid payload: 'messages' array is required." },
        { status: 400 }
      );
    }

    const result = await runAgentOrchestrator({
      persona,
      messages,
      userId,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error during agent execution.";
    console.error("[API /api/agent error]", error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
