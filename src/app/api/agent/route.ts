import { NextRequest, NextResponse } from "next/server";
import { runAgentOrchestrator } from "@/lib/agent/orchestrator";
import { executeAgentTool } from "@/lib/agent/tools";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, persona = "GENERAL", actionToConfirm } = body;

    // Handle single-tap confirmation of an action card (Layer D)
    if (actionToConfirm && actionToConfirm.action === "DISPATCH_INVOICES") {
      const dispatchResult = await executeAgentTool("dispatch_paypal_invoices", {
        recipients: actionToConfirm.recipients,
        isConfirmed: true,
      });

      return NextResponse.json({
        reply: `✅ Successfully dispatched ${dispatchResult.dispatchedCount} PayPal invoices via Sandbox API.`,
        actionCard: null,
        executedTools: [{ name: "dispatch_paypal_invoices", args: actionToConfirm, result: dispatchResult }],
      });
    }

    if (actionToConfirm && actionToConfirm.action === "DISPATCH_PAYOUT") {
      const recipientEmail = actionToConfirm.recipientEmail || actionToConfirm.recipients?.[0]?.email;
      const amount = actionToConfirm.amount || actionToConfirm.totalAmount;
      const note = actionToConfirm.note || actionToConfirm.recipients?.[0]?.description || "Direct Settlement via PocketMate";

      const payoutResult = await executeAgentTool("send_direct_payout", {
        recipientEmail,
        amount,
        note,
        isConfirmed: true,
      });

      return NextResponse.json({
        reply: `✅ Successfully transferred $${Number(amount).toFixed(2)} to ${recipientEmail} via PayPal Payouts API.`,
        actionCard: null,
        executedTools: [{ name: "send_direct_payout", args: actionToConfirm, result: payoutResult }],
      });
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
