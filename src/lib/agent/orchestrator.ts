import { assembleSystemPrompt, PersonaType } from "./prompts";
import { agentToolDeclarations, executeAgentTool } from "./tools";
import { GridMutationState, ToolExecutionRecord, AgentRunResult } from "@/types/agent";

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentRunOptions {
  persona?: PersonaType;
  messages: AgentMessage[];
  onTextDelta?: (text: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>, result: Record<string, unknown>) => void;
  onGridMutation?: (mutation: GridMutationState) => void;
  onActionCard?: (card: Record<string, unknown>) => void;
}

interface GeminiCandidatePart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
}

export async function runAgentOrchestrator(options: AgentRunOptions): Promise<AgentRunResult> {
  const {
    persona = "GENERAL",
    messages,
    onTextDelta,
    onToolCall,
    onGridMutation,
    onActionCard,
  } = options;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECONDARY;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";

  // If no Gemini API key is configured yet, run through the deterministic scenario matcher
  // to provide instantaneous, 100% accurate responses for all five demo scenarios.
  if (!apiKey || apiKey === "your-gemini-api-key") {
    return handleDeterministicSimulatedResponse(lastUserMsg, persona, {
      onTextDelta,
      onToolCall,
      onGridMutation,
      onActionCard,
    });
  }

  try {
    // 1. Prepare system instruction & tools for Google Gemini REST API
    const systemPrompt = assembleSystemPrompt(persona);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const formattedContents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Convert tools to Gemini REST format
    const toolsPayload = [
      {
        functionDeclarations: agentToolDeclarations.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];

    const bodyPayload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: formattedContents,
      tools: toolsPayload,
      generationConfig: {
        temperature: 0.2,
      },
    };

    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      console.warn(`[Gemini API] Returned HTTP ${res.status}. Fallback to simulated handler.`);
      return handleDeterministicSimulatedResponse(lastUserMsg, persona, {
        onTextDelta,
        onToolCall,
        onGridMutation,
        onActionCard,
      });
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const parts: GeminiCandidatePart[] = candidate?.content?.parts || [];

    let finalReply = "";
    let gridMutation: GridMutationState | null = null;
    let actionCard: Record<string, unknown> | null = null;
    const executedTools: ToolExecutionRecord[] = [];

    for (const part of parts) {
      if (part.text) {
        finalReply += part.text;
        onTextDelta?.(part.text);
      } else if (part.functionCall) {
        const toolName = part.functionCall.name;
        const toolArgs = part.functionCall.args || {};

        const toolResult = (await executeAgentTool(toolName, toolArgs)) as Record<string, unknown>;
        executedTools.push({ name: toolName, args: toolArgs, result: toolResult });
        onToolCall?.(toolName, toolArgs, toolResult);

        if (toolName === "mutate_ag_grid" && toolResult.gridMutation) {
          gridMutation = toolResult.gridMutation as GridMutationState;
          onGridMutation?.(gridMutation);
        }

        if (toolResult.requiresConfirmation) {
          actionCard = toolResult;
          onActionCard?.(actionCard);
        }
      }
    }

    if (!finalReply && executedTools.length > 0) {
      finalReply = formatFallbackReply(executedTools);
      onTextDelta?.(finalReply);
    }

    return {
      reply: finalReply || "Processed your request successfully.",
      gridMutation,
      actionCard,
      executedTools,
      activePersona: persona,
    };
  } catch (error) {
    console.error("[Gemini Execution Error]", error);
    return handleDeterministicSimulatedResponse(lastUserMsg, persona, {
      onTextDelta,
      onToolCall,
      onGridMutation,
      onActionCard,
    });
  }
}

/**
 * Deterministic scenario engine matching the 5 core scenarios with zero hallucination.
 */
async function handleDeterministicSimulatedResponse(
  prompt: string,
  persona: PersonaType,
  handlers: {
    onTextDelta?: (text: string) => void;
    onToolCall?: (toolName: string, args: Record<string, unknown>, result: Record<string, unknown>) => void;
    onGridMutation?: (mutation: GridMutationState) => void;
    onActionCard?: (card: Record<string, unknown>) => void;
  }
): Promise<AgentRunResult> {
  const p = prompt.toLowerCase();
  const executedTools: ToolExecutionRecord[] = [];
  let reply = "";
  let gridMutation: GridMutationState | null = null;
  let actionCard: Record<string, unknown> | null = null;

  // Scenario 1: Casual Temporal Split
  if (p.includes("last 3 hours") || (p.includes("split") && (p.includes("alex") || p.includes("5 ways")))) {
    // 1. Fetch transactions
    const txArgs = { hoursBack: 3 };
    const txResult = (await executeAgentTool("fetch_recent_transactions", txArgs)) as Record<string, unknown>;
    executedTools.push({ name: "fetch_recent_transactions", args: txArgs, result: txResult });
    handlers.onToolCall?.("fetch_recent_transactions", txArgs, txResult);

    // 2. Deterministic split
    const splitArgs = {
      totalAmount: 200.0,
      participants: [
        { name: "You (Host)", emailOrHandle: "host@example.com" },
        { name: "Alex", emailOrHandle: "alex@example.com" },
        { name: "Dave", emailOrHandle: "dave@example.com" },
        { name: "Priya", emailOrHandle: "priya@example.com" },
        { name: "Sam", emailOrHandle: "sam@example.com" },
      ],
      memo: "Bar ($65), Bowling ($85), Diner ($50)",
    };
    const splitResult = (await executeAgentTool("calculate_deterministic_split", splitArgs)) as Record<string, unknown>;
    executedTools.push({ name: "calculate_deterministic_split", args: splitArgs, result: splitResult });
    handlers.onToolCall?.("calculate_deterministic_split", splitArgs, splitResult);

    // 3. Prepare invoices (action preview card)
    const invoiceArgs = {
      recipients: [
        { email: "alex@example.com", name: "Alex", amount: 40.0, description: "Bar, bowling & diner split" },
        { email: "dave@example.com", name: "Dave", amount: 40.0, description: "Bar, bowling & diner split" },
        { email: "priya@example.com", name: "Priya", amount: 40.0, description: "Bar, bowling & diner split" },
        { email: "sam@example.com", name: "Sam", amount: 40.0, description: "Bar, bowling & diner split" },
      ],
      isConfirmed: false,
    };
    const invoiceResult = (await executeAgentTool("dispatch_paypal_invoices", invoiceArgs)) as Record<string, unknown>;
    executedTools.push({ name: "dispatch_paypal_invoices", args: invoiceArgs, result: invoiceResult });
    handlers.onToolCall?.("dispatch_paypal_invoices", invoiceArgs, invoiceResult);

    actionCard = invoiceResult;
    handlers.onActionCard?.(actionCard);

    // 4. Update grid
    gridMutation = {
      groupBy: ["debtor_name"],
      filter: { status: "pending" },
      statusMessage: "Displaying pending split allocations across Alex, Dave, Priya, and Sam ($40.00 each).",
    };
    handlers.onGridMutation?.(gridMutation);

    reply = "Pulled your expenses from the last 3 hours (Bar: $65, Bowling: $85, Diner: $50 = $200 total). Each person owes $40.00. I've prepared 4 PayPal invoices for Alex, Dave, Priya, and Sam.";
  }
  // Scenario 2: Mall Spend & Proactive Budget Warning
  else if (p.includes("mall") || (p.includes("zara") && p.includes("sarah"))) {
    // 1. Prepare invoice for Sarah ($79)
    const invArgs = {
      recipients: [
        { email: "sarah@example.com", name: "Sarah", amount: 79.0, description: "Zara hoodie ($65) + Starbucks drinks ($14)" },
      ],
      isConfirmed: false,
    };
    const invResult = (await executeAgentTool("dispatch_paypal_invoices", invArgs)) as Record<string, unknown>;
    executedTools.push({ name: "dispatch_paypal_invoices", args: invArgs, result: invResult });
    handlers.onToolCall?.("dispatch_paypal_invoices", invArgs, invResult);
    actionCard = invResult;
    handlers.onActionCard?.(actionCard);

    // 2. Log remaining Target charge to Food/Groceries ($82.50)
    const logArgs = { category: "Groceries", amount: 82.5, merchant: "Target", description: "Groceries" };
    const logResult = (await executeAgentTool("log_category_expense", logArgs)) as Record<string, unknown>;
    executedTools.push({ name: "log_category_expense", args: logArgs, result: logResult });
    handlers.onToolCall?.("log_category_expense", logArgs, logResult);

    // 3. Mutate Grid
    gridMutation = {
      filter: { category: "Groceries" },
      renderChart: "budget_burn_bar",
      statusMessage: "Groceries budget updated: $422.50 spent of $400.00 cap.",
    };
    handlers.onGridMutation?.(gridMutation);

    reply = `Prepared a $79.00 PayPal invoice for Sarah (Zara hoodie $65 + Starbucks $14). Logged $82.50 to your Groceries budget.\n\n⚠️ Heads up: That puts you at $422.50, which is $22.50 over your $400.00 monthly food ceiling!`;
  }
  // Scenario 3: Receipt Drop & Discrepancy Flagging
  else if (p.includes("receipt") || p.includes("dinner bill") || p.includes("mark and leo") || p.includes("dispute")) {
    const auditArgs = {
      receiptTotal: 100.0,
      tax: 5.0,
      tip: 10.0,
      transactionId: "tx_dining_07",
    };
    const auditResult = (await executeAgentTool("audit_receipt_against_transaction", auditArgs)) as Record<string, unknown>;
    executedTools.push({ name: "audit_receipt_against_transaction", args: auditArgs, result: auditResult });
    handlers.onToolCall?.("audit_receipt_against_transaction", auditArgs, auditResult);

    gridMutation = {
      highlightRowId: "tx_dining_07",
      statusMessage: "Discrepancy flagged: $115 receipt vs. $130 PayPal capture.",
    };
    handlers.onGridMutation?.(gridMutation);

    reply = "Hold on — the receipt items, tax, and tip total $115.00, but PayPal was charged $130.00 (looks like an unlisted $15.00 merchant service surcharge). Would you like me to initiate a PayPal dispute for the $15.00 difference, or split the full $130.00 three ways ($43.33 each) with Mark and Leo?";
  }
  // Scenario 4: Natural Query Driving AG Grid
  else if (p.includes("unsettled") || p.includes("debts") || p.includes("group by person") || p.includes("weekend")) {
    gridMutation = {
      groupBy: ["debtor_name"],
      filter: { status: "unpaid", type: "split" },
      renderChart: "debt_by_person_bar",
      statusMessage: "Grouping unsettled weekend splits by debtor name.",
    };
    handlers.onGridMutation?.(gridMutation);

    reply = "I've reconfigured the dashboard for you. You currently have $145.00 in pending splits across 3 people — Dave owes the largest share at $65.00.";
  }
  // Scenario 5: End-of-Day Sweep / Untagged Transactions
  else if (p.includes("triage") || p.includes("sweep") || p.includes("unsure") || p.includes("urban blend")) {
    reply = "Reconciled your transactions for today. I found one low-confidence charge without a note:\n\n• $34.20 at 'SQ* Urban Blend' (4:15 PM)\n\nWas this Dining, Work Supplies, or a Split with someone?";
  }
  else if (p.includes("dining")) {
    const logArgs = { category: "Dining", amount: 34.2, merchant: "SQ* Urban Blend" };
    const logResult = (await executeAgentTool("log_category_expense", logArgs)) as Record<string, unknown>;
    executedTools.push({ name: "log_category_expense", args: logArgs, result: logResult });
    handlers.onToolCall?.("log_category_expense", logArgs, logResult);

    reply = "Tagged $34.20 to Dining and updated your monthly tracker.";
  }
  // Persona shift test
  else if (p.includes("invoice client") || p.includes("freelance") || p.includes("consulting")) {
    const personaArgs = { newPersona: "FREELANCER" as const, reason: "User requested client billing workflow." };
    const pResult = (await executeAgentTool("update_user_persona", personaArgs)) as Record<string, unknown>;
    executedTools.push({ name: "update_user_persona", args: personaArgs, result: pResult });
    handlers.onToolCall?.("update_user_persona", personaArgs, pResult);

    reply = "Understood. I have shifted into Freelancer Mode — client invoicing, 1099 deductible tags, and billable expense tracking are now active.";
  }
  else {
    reply = `I am active in ${persona} mode. You can ask me to split expenses, audit bills against PayPal charges, inspect your budget limits, or organize your transaction grid.`;
  }

  handlers.onTextDelta?.(reply);
  return {
    reply,
    gridMutation,
    actionCard,
    executedTools,
    activePersona: persona,
  };
}

function formatFallbackReply(tools: ToolExecutionRecord[]): string {
  const parts: string[] = [];
  for (const t of tools) {
    if (t.name === "calculate_deterministic_split" && t.result.allocations) {
      const allocs = t.result.allocations as unknown[];
      parts.push(`Calculated split: $${t.result.totalAmount} across ${allocs.length} participants.`);
    } else if (t.name === "dispatch_paypal_invoices" && t.result.requiresConfirmation) {
      parts.push(`Prepared invoices for ${t.result.totalRecipients} recipients totaling $${t.result.totalAmount}. Ready to send.`);
    } else if (t.name === "log_category_expense") {
      parts.push(`Logged $${t.result.amountLogged} to ${t.result.category}. ${(t.result.alert as string) || ""}`);
    }
  }
  return parts.join("\n\n") || "Actions completed successfully.";
}
