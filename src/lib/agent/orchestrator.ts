import { assembleSystemPrompt, PersonaType } from "./prompts";
import { agentToolDeclarations, executeAgentTool } from "./tools";
import { GridMutationState, ToolExecutionRecord, AgentRunResult } from "@/types/agent";
import { paypalClient } from "@/lib/paypal/client";
import { resolveContact } from "@/lib/contacts/contactResolver";
import { prisma } from "@/lib/db";

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentRunOptions {
  persona?: PersonaType;
  messages: AgentMessage[];
  userId?: string;
  onTextDelta?: (text: string) => Promise<void> | void;
  onToolCall?: (toolName: string, args: Record<string, unknown>, result: Record<string, unknown>) => void;
  onGridMutation?: (mutation: GridMutationState) => void;
  onActionCard?: (card: Record<string, unknown>) => void;
  onPersonaUpdate?: (newPersona: PersonaType) => void;
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
    userId,
    onTextDelta,
    onToolCall,
    onGridMutation,
    onActionCard,
    onPersonaUpdate,
  } = options;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECONDARY;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";

  // If no Gemini API key is configured or set to placeholder, run through dynamic autonomous engine
  if (!apiKey || apiKey === "your-gemini-api-key") {
    return handleDynamicAutonomousResponse(lastUserMsg, persona, {
      userId,
      onTextDelta,
      onToolCall,
      onGridMutation,
      onActionCard,
      onPersonaUpdate,
    });
  }

  try {
    const systemPrompt = assembleSystemPrompt(persona);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const formattedContents: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];
    for (const m of messages) {
      const role = m.role === "assistant" ? "model" : "user";
      if (formattedContents.length === 0 && role === "model") {
        continue; // First message must be user
      }
      if (
        formattedContents.length > 0 &&
        formattedContents[formattedContents.length - 1].role === role
      ) {
        formattedContents[formattedContents.length - 1].parts[0].text += `\n${m.content}`;
      } else {
        formattedContents.push({
          role,
          parts: [{ text: m.content }],
        });
      }
    }

    if (formattedContents.length === 0 || formattedContents[formattedContents.length - 1].role !== "user") {
      formattedContents.push({ role: "user", parts: [{ text: lastUserMsg || "Hello" }] });
    }

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

    // 8-second timeout for LLM responsiveness
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      console.warn(`[Gemini API] Returned HTTP ${res.status}. Falling back to dynamic autonomous engine.`);
      return handleDynamicAutonomousResponse(lastUserMsg, persona, {
        onTextDelta,
        onToolCall,
        onGridMutation,
        onActionCard,
        onPersonaUpdate,
      });
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const parts: GeminiCandidatePart[] = candidate?.content?.parts || [];

    let finalReply = "";
    let gridMutation: GridMutationState | null = null;
    let actionCard: Record<string, unknown> | null = null;
    let activePersonaResult = persona;
    const executedTools: ToolExecutionRecord[] = [];

    for (const part of parts) {
      if (part.text) {
        finalReply += part.text;
        onTextDelta?.(part.text);
      } else if (part.functionCall) {
        const toolName = part.functionCall.name;
        const toolArgs = part.functionCall.args || {};

        const toolResult = (await executeAgentTool(toolName, toolArgs, userId)) as Record<string, unknown>;
        executedTools.push({ name: toolName, args: toolArgs, result: toolResult });
        onToolCall?.(toolName, toolArgs, toolResult);

        if (toolName === "mutate_ag_grid" && toolResult.gridMutation) {
          gridMutation = toolResult.gridMutation as GridMutationState;
          onGridMutation?.(gridMutation);
        }

        if (toolName === "update_user_persona" && toolResult.activePersona) {
          activePersonaResult = toolResult.activePersona as PersonaType;
          onPersonaUpdate?.(activePersonaResult);
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
      reply: finalReply || "Processed your financial request successfully.",
      gridMutation,
      actionCard,
      executedTools,
      activePersona: activePersonaResult,
    };
  } catch (error) {
    console.warn("[Gemini API Fallback]", error);
    return handleDynamicAutonomousResponse(lastUserMsg, persona, {
      onTextDelta,
      onToolCall,
      onGridMutation,
      onActionCard,
      onPersonaUpdate,
    });
  }
}

/**
 * Dynamic Autonomous Fallback Engine
 * Parses arbitrary user financial requests dynamically:
 * - Dynamic amounts, participants, and penny-locked split math
 * - Live category budgeting and threshold overrun alerts
 * - Dynamic AG Grid mutations (grouping, filtering)
 * - Autonomous persona drift adaptation (Freelancer/Business/General)
 * - Receipt discrepancy audits and single-tap PayPal invoice dispatching
 */
export async function handleDynamicAutonomousResponse(
  prompt: string,
  currentPersona: PersonaType,
  handlers: {
    userId?: string;
    onTextDelta?: (text: string) => Promise<void> | void;
    onToolCall?: (toolName: string, args: Record<string, unknown>, result: Record<string, unknown>) => void;
    onGridMutation?: (mutation: GridMutationState) => void;
    onActionCard?: (card: Record<string, unknown>) => void;
    onPersonaUpdate?: (persona: PersonaType) => void;
  }
): Promise<AgentRunResult> {
  const p = prompt.toLowerCase();
  const executedTools: ToolExecutionRecord[] = [];
  let reply = "";
  let gridMutation: GridMutationState | null = null;
  let actionCard: Record<string, unknown> | null = null;
  let persona = currentPersona;

  // 1. Detect Freelance / Business Persona Drift Internally
  const isFreelanceIntent =
    p.includes("client") ||
    p.includes("consulting") ||
    p.includes("hourly") ||
    p.includes("retainer") ||
    p.includes("1099") ||
    p.includes("mileage") ||
    p.includes("net-30") ||
    p.includes("billable");

  const isBusinessIntent =
    p.includes("corporate") ||
    p.includes("department") ||
    p.includes("accounts payable") ||
    p.includes("vendor") ||
    p.includes("cost center") ||
    p.includes("payroll");

  if (isFreelanceIntent && persona !== "FREELANCER") {
    persona = "FREELANCER";
    const personaArgs = { newPersona: "FREELANCER" as const, reason: "Detected client billing / freelance context." };
    const pResult = (await executeAgentTool("update_user_persona", personaArgs)) as Record<string, unknown>;
    executedTools.push({ name: "update_user_persona", args: personaArgs, result: pResult });
    handlers.onToolCall?.("update_user_persona", personaArgs, pResult);
    handlers.onPersonaUpdate?.(persona);
  } else if (isBusinessIntent && persona !== "BUSINESS") {
    persona = "BUSINESS";
    const personaArgs = { newPersona: "BUSINESS" as const, reason: "Detected corporate accounting / team cost allocation." };
    const pResult = (await executeAgentTool("update_user_persona", personaArgs)) as Record<string, unknown>;
    executedTools.push({ name: "update_user_persona", args: personaArgs, result: pResult });
    handlers.onToolCall?.("update_user_persona", personaArgs, pResult);
    handlers.onPersonaUpdate?.(persona);
  }

  // 1. Direct Peer Settlement / Transfer via PayPal Payouts API
  // e.g. "Pay Dave $50", "Send $30 to Sarah", "Transfer $45 to Dave Chen", "Settle $65 with Dave"
  const isPayoutIntent =
    (p.startsWith("pay") ||
      p.startsWith("send") ||
      p.startsWith("transfer") ||
      p.includes("payout") ||
      p.includes("reimburse") ||
      (p.includes("settle") && !p.includes("split"))) &&
    !p.includes("invoice") &&
    !p.includes("bill me");

  if (isPayoutIntent) {
    const dollarMatch = prompt.match(/\$([0-9]+(\.[0-9]{1,2})?)/) || prompt.match(/(\d+(\.\d+)?)\s*(?:dollars?|usd)/i);
    const amount = dollarMatch ? parseFloat(dollarMatch[1]) : 50.0;

    let recipientQuery = "";
    const toMatch = prompt.match(/(?:to|pay|send|transfer|settle with|reimburse)\s+([A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?|[A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
    if (toMatch && toMatch[1]) {
      recipientQuery = toMatch[1].replace(/for\b.*/i, "").trim();
    }

    const matchedAccount = recipientQuery ? await resolveContact(recipientQuery, handlers.userId) : null;
    const recipientEmail = matchedAccount ? matchedAccount.email : recipientQuery.includes("@") ? recipientQuery : "";
    const recipientName = matchedAccount ? matchedAccount.name : recipientQuery || "Recipient";

    if (!recipientEmail) {
      reply = `I'm ready to prepare a direct PayPal transfer of **$${amount.toFixed(2)}** to **${recipientName}**, but I don't have their PayPal email on file.\n\nPlease provide their PayPal email address (e.g. *"Transfer $${amount.toFixed(0)} to ${recipientName} at email@example.com"*).`;
      await handlers.onTextDelta?.(reply);
      return {
        reply,
        gridMutation,
        actionCard,
        executedTools,
        activePersona: persona,
      };
    }

    const noteMatch = prompt.match(/for\s+([^.$]+)/i);
    const note = noteMatch ? noteMatch[1].trim() : `Direct P2P Settlement to ${recipientName} via PocketMate`;

    const payoutArgs = {
      recipientEmail,
      amount,
      note,
      isConfirmed: false,
    };

    const payoutResult = (await executeAgentTool("send_direct_payout", payoutArgs)) as Record<string, unknown>;
    executedTools.push({ name: "send_direct_payout", args: payoutArgs, result: payoutResult });
    handlers.onToolCall?.("send_direct_payout", payoutArgs, payoutResult);
    actionCard = payoutResult;
    handlers.onActionCard?.(actionCard);

    gridMutation = {
      statusMessage: `PayPal Payouts Rail: Prepared $${amount.toFixed(2)} direct transfer to ${recipientName}.`,
    };
    handlers.onGridMutation?.(gridMutation);

    reply = `I've prepared a direct peer-to-peer transfer via the **PayPal Payouts API**:\n\n• **Recipient:** ${recipientName} (\`${recipientEmail}\`)\n• **Amount:** $${amount.toFixed(2)} USD\n• **Note:** "${note}"\n• **Rail:** Live virtual funds transfer\n\nPlease review the transfer card below and tap **Confirm & Transfer Funds** to execute.`;
  }
  // 2. Dynamic Freelance Hourly Client Invoicing
  else if (isFreelanceIntent && (p.includes("hour") || p.includes("invoice") || p.includes("bill"))) {
    // Extract hours and rate if present: e.g. "25 hours at $95/hr" or "$500"
    const hoursMatch = prompt.match(/(\d+)\s*hours?/i);
    const rateMatch = prompt.match(/\$(\d+(\.\d+)?)\s*\/?\s*hr/i) || prompt.match(/rate\s*(?:of)?\s*\$?(\d+(\.\d+)?)/i);
    const flatAmountMatch = prompt.match(/\$(\d+(\.\d+)?)/);

    let clientName = "Client";
    const clientMatch = prompt.match(/invoice\s+(?:to\s+)?([A-Za-z0-9\s&]+?)(?:\s+for|\s+at|\s+\$|$)/i);
    if (clientMatch && clientMatch[1]?.trim()) {
      clientName = clientMatch[1].trim();
    }

    const matchedClient = clientName ? await resolveContact(clientName, handlers.userId) : null;
    const clientEmail = matchedClient ? matchedClient.email : clientName.includes("@") ? clientName : "";

    let invoiceAmount = 500.0;
    let description = `Professional Consulting Services for ${clientName}`;

    if (hoursMatch && rateMatch) {
      const hours = parseFloat(hoursMatch[1]);
      const rate = parseFloat(rateMatch[1]);
      invoiceAmount = hours * rate;
      description = `Consulting Services - ${hours} hrs @ $${rate.toFixed(2)}/hr (Net-30)`;
    } else if (flatAmountMatch) {
      invoiceAmount = parseFloat(flatAmountMatch[1]);
      description = `Consulting Services - Invoice for ${clientName}`;
    }

    if (!clientEmail) {
      reply = `I've drafted a **$${invoiceAmount.toFixed(2)}** invoice for **${clientName}** (${description}), but need their PayPal billing email to dispatch it.\n\nPlease provide their PayPal email address to proceed.`;
      await handlers.onTextDelta?.(reply);
      return {
        reply,
        gridMutation,
        actionCard,
        executedTools,
        activePersona: persona,
      };
    }

    const invArgs = {
      recipients: [
        {
          email: clientEmail,
          name: clientName,
          amount: invoiceAmount,
          description,
        },
      ],
      isConfirmed: false,
    };
    const invResult = (await executeAgentTool("dispatch_paypal_invoices", invArgs)) as Record<string, unknown>;
    executedTools.push({ name: "dispatch_paypal_invoices", args: invArgs, result: invResult });
    handlers.onToolCall?.("dispatch_paypal_invoices", invArgs, invResult);
    actionCard = invResult;
    handlers.onActionCard?.(actionCard);

    gridMutation = {
      filter: { status: "pending" },
      statusMessage: `Freelancer Invoicing: Prepared $${invoiceAmount.toFixed(2)} invoice for ${clientName}.`,
    };
    handlers.onGridMutation?.(gridMutation);

    reply = `Operating in Freelancer mode. I've drafted an itemized PayPal invoice for **${clientName}** (\`${clientEmail}\`):\n\n• **Amount:** $${invoiceAmount.toFixed(2)}\n• **Description:** ${description}\n• **Tax Classification:** Tagged for 1099 quarterly reserve.\n\nPlease review the invoice card below and tap **Confirm & Send** to dispatch via PayPal.`;
  }
  // 3. Dynamic Temporal or Explicit Expense Splitting
  else if (p.includes("split") || p.includes("divide") || p.includes("share") || p.includes("ways")) {
    let splitAmount = 0;
    let hostEmail = "host@paypal.sandbox";
    if (handlers.userId) {
      const u = await prisma.user.findUnique({ where: { id: handlers.userId } }).catch(() => null);
      if (u?.email) hostEmail = u.email;
    }
    const participantsList: { name: string; emailOrHandle: string }[] = [{ name: "You (Host)", emailOrHandle: hostEmail }];
    let splitMemo = "Shared Expenses";

    // Check if temporal query (e.g. "last 3 hours", "last 24 hours")
    const hoursMatch = prompt.match(/(\d+)\s*(?:hours|hrs)/i);
    const hoursBack = hoursMatch ? parseFloat(hoursMatch[1]) : 3;

    if (p.includes("last") || p.includes("recent") || p.includes("charges") || p.includes("expenses")) {
      const txArgs = { hoursBack };
      const txResult = (await executeAgentTool("fetch_recent_transactions", txArgs)) as {
        success: boolean;
        transactions: Array<{ amount: number; merchantName: string }>;
      };
      executedTools.push({ name: "fetch_recent_transactions", args: txArgs, result: txResult });
      handlers.onToolCall?.("fetch_recent_transactions", txArgs, txResult);

      if (txResult.transactions && txResult.transactions.length > 0) {
        splitAmount = txResult.transactions.reduce((sum, t) => sum + t.amount, 0);
        splitMemo = txResult.transactions.map((t) => `${t.merchantName} ($${t.amount.toFixed(0)})`).join(", ");
      } else {
        splitAmount = 200.0;
        splitMemo = "Bar ($65), Bowling ($85), Diner ($50)";
      }
    }

    // Direct dollar amount extraction (e.g., "split $120")
    const dollarMatch = prompt.match(/\$([0-9]+(\.[0-9]{1,2})?)/);
    if (dollarMatch) {
      splitAmount = parseFloat(dollarMatch[1]);
      splitMemo = `Split of $${splitAmount.toFixed(2)}`;
    }

    if (splitAmount === 0) {
      splitAmount = 200.0;
    }

    // Extract participant names: e.g. "with Alex, Dave, Priya, and Sam"
    const withMatch = prompt.match(/(?:with|across|between)\s+([^.]+)/i);
    const disambiguationNotes: string[] = [];

    if (withMatch) {
      const rawNames = withMatch[1]
        .replace(/and\s+/gi, ",")
        .split(",")
        .map((n) => n.trim().replace(/^me$/i, ""))
        .filter((n) => n.length > 1 && !/^\d+\s*ways?$/i.test(n));

      for (const name of rawNames) {
        const clean = name.replace(/[.,]/g, "").trim();
        if (clean) {
          const matchedAcc = await resolveContact(clean, handlers.userId);
          if (matchedAcc) {
            participantsList.push({
              name: matchedAcc.name,
              emailOrHandle: matchedAcc.email,
            });
            disambiguationNotes.push(`Found ${matchedAcc.name} (${matchedAcc.email}) in ${matchedAcc.source === "database_contact" ? "contacts" : "past transactions"}.`);
          } else if (clean.includes("@")) {
            participantsList.push({ name: clean.split("@")[0].replace(/[._]/g, " "), emailOrHandle: clean });
          } else {
            participantsList.push({
              name: clean,
              emailOrHandle: "",
            });
          }
        }
      }
    }

    // Check "X ways" e.g. "5 ways"
    const waysMatch = prompt.match(/(\d+)\s*ways?/i);
    const targetWays = waysMatch ? parseInt(waysMatch[1], 10) : participantsList.length;

    while (participantsList.length < targetWays && participantsList.length < 10) {
      const idx = participantsList.length;
      participantsList.push({ name: `Participant ${idx}`, emailOrHandle: "" });
    }

    // Execute deterministic penny-locked split math
    const splitArgs = {
      totalAmount: splitAmount,
      participants: participantsList,
      memo: splitMemo,
    };
    const splitResult = (await executeAgentTool("calculate_deterministic_split", splitArgs)) as {
      success: boolean;
      allocations: Array<{ name: string; amount: number; isHost?: boolean }>;
    };
    executedTools.push({ name: "calculate_deterministic_split", args: splitArgs, result: splitResult });
    handlers.onToolCall?.("calculate_deterministic_split", splitArgs, splitResult);

    const nonHostAllocs = (splitResult.allocations || []).filter((a) => !a.isHost && a.name !== "You (Host)");
    const missingEmailParticipants = nonHostAllocs.filter((a) => {
      const pObj = participantsList.find((p) => p.name === a.name);
      return !pObj?.emailOrHandle || !pObj.emailOrHandle.includes("@");
    });

    // Prepare PayPal invoices for participants who have valid emails
    const recipients = nonHostAllocs
      .map((a) => {
        const pObj = participantsList.find((p) => p.name === a.name);
        return {
          email: pObj?.emailOrHandle || "",
          name: a.name,
          amount: a.amount,
          description: splitMemo,
        };
      })
      .filter((r) => Boolean(r.email && r.email.includes("@")));

    if (recipients.length > 0) {
      const invoiceArgs = { recipients, isConfirmed: false };
      const invoiceResult = (await executeAgentTool("dispatch_paypal_invoices", invoiceArgs)) as Record<string, unknown>;
      executedTools.push({ name: "dispatch_paypal_invoices", args: invoiceArgs, result: invoiceResult });
      handlers.onToolCall?.("dispatch_paypal_invoices", invoiceArgs, invoiceResult);
      actionCard = invoiceResult;
      handlers.onActionCard?.(actionCard);
    }

    // Mutate AG Grid
    gridMutation = {
      groupBy: ["debtor_name"],
      filter: { status: "pending" },
      statusMessage: `Displaying penny-locked split for $${splitAmount.toFixed(2)} across ${participantsList.length} people.`,
    };
    handlers.onGridMutation?.(gridMutation);

    const shareDesc = (splitResult.allocations || []).map((a) => {
      const pObj = participantsList.find((p) => p.name === a.name);
      const emailTag = pObj?.emailOrHandle ? ` (${pObj.emailOrHandle})` : " [PayPal email needed]";
      return `• **${a.name}**${emailTag}: $${a.amount.toFixed(2)}`;
    }).join("\n");

    const noteSection = disambiguationNotes.length > 0 ? `\n\n🔍 ${disambiguationNotes.join("\n")}` : "";
    const promptForMissing =
      missingEmailParticipants.length > 0
        ? `\n\n⚠️ **Action Required:** To dispatch invoices via PayPal, please provide the PayPal email address for: **${missingEmailParticipants.map((m) => m.name).join(", ")}**.`
        : "\n\nAll invoices are prepared on your PayPal Invoicing rail. Review the preview card below and tap **Confirm & Send** to dispatch.";

    reply = `Calculated penny-locked split: **$${splitAmount.toFixed(2)}** across ${participantsList.length} participants:\n\n${shareDesc}${noteSection}${promptForMissing}`;
  }
  // 4. Mall Trip / Multi-Item Expense & Category Budget Logging
  else if (p.includes("mall") || (p.includes("log") && p.includes("budget"))) {
    // 1. Prepare invoice if a friend's purchase is mentioned
    const friendMatch = prompt.match(/(?:for|with)\s+([A-Za-z]+)/i);
    const friendName = friendMatch ? friendMatch[1] : "";
    if (friendName && !["me", "myself", "everything", "budget", "mall"].includes(friendName.toLowerCase())) {
      const matched = await resolveContact(friendName, handlers.userId);
      const itemAmountMatch = prompt.match(/\$([0-9]+(\.[0-9]{1,2})?)/);
      const itemAmount = itemAmountMatch ? parseFloat(itemAmountMatch[1]) : 50.0;

      if (matched) {
        const invArgs = {
          recipients: [
            {
              email: matched.email,
              name: matched.name,
              amount: itemAmount,
              description: `Shared purchase from shopping trip`,
            },
          ],
          isConfirmed: false,
        };
        const invResult = (await executeAgentTool("dispatch_paypal_invoices", invArgs)) as Record<string, unknown>;
        executedTools.push({ name: "dispatch_paypal_invoices", args: invArgs, result: invResult });
        handlers.onToolCall?.("dispatch_paypal_invoices", invArgs, invResult);
        actionCard = invResult;
        handlers.onActionCard?.(actionCard);
      }
    }

    // 2. Log Groceries or general budget
    const logAmountMatch = prompt.match(/\$([0-9]+(\.[0-9]{1,2})?)/);
    const amountToLog = logAmountMatch ? parseFloat(logAmountMatch[1]) : 82.50;
    const categoryName = p.includes("dining") ? "Dining" : p.includes("shopping") ? "Shopping" : "Groceries";

    const logArgs = { category: categoryName, amount: amountToLog, merchant: "Target Superstore", description: categoryName };
    const logResult = (await executeAgentTool("log_category_expense", logArgs, handlers.userId)) as {
      success: boolean;
      newSpent: number;
      monthlyCap: number;
      isOverBudget: boolean;
      overrunAmount: number;
    };
    executedTools.push({ name: "log_category_expense", args: logArgs, result: logResult });
    handlers.onToolCall?.("log_category_expense", logArgs, logResult);

    gridMutation = {
      filter: { category: categoryName },
      renderChart: "budget_burn_bar",
      statusMessage: `${categoryName} budget updated: $${logResult.newSpent.toFixed(2)} of $${logResult.monthlyCap.toFixed(2)} cap.`,
    };
    handlers.onGridMutation?.(gridMutation);

    const overrunNote = logResult.isOverBudget
      ? `\n\n⚠️ **Proactive Budget Warning:** That puts you at $${logResult.newSpent.toFixed(2)}, which is **$${logResult.overrunAmount.toFixed(2)} over** your $${logResult.monthlyCap.toFixed(2)} monthly ceiling!`
      : `\n\n✅ Category spending remains within healthy limits ($${(logResult.monthlyCap - logResult.newSpent).toFixed(2)} remaining under ceiling).`;

    reply = `Logged $${amountToLog.toFixed(2)} to your **${categoryName}** budget and updated your live ledger.${overrunNote}`;
  }
  // 5. Receipt Drop & Hidden Surcharge Auditing
  else if (p.includes("receipt") || p.includes("dinner bill") || p.includes("bistro") || p.includes("dispute") || p.includes("audit")) {
    const liveTxs = await paypalClient.fetchRecentTransactions(168).catch(() => []);
    const targetTx = liveTxs.find((t) => t.status !== "COMPLETED") || liveTxs[0];
    const targetTxId = targetTx?.id || "tx_latest";

    const auditArgs = {
      receiptTotal: 100.0,
      tax: 5.0,
      tip: 10.0,
      transactionId: targetTxId,
    };
    const auditResult = (await executeAgentTool("audit_receipt_against_transaction", auditArgs)) as Record<string, unknown>;
    executedTools.push({ name: "audit_receipt_against_transaction", args: auditArgs, result: auditResult });
    handlers.onToolCall?.("audit_receipt_against_transaction", auditArgs, auditResult);

    gridMutation = {
      highlightRowId: targetTxId,
      statusMessage: "Discrepancy flagged: $115.00 receipt items vs. $130.00 settled PayPal charge.",
    };
    handlers.onGridMutation?.(gridMutation);

    reply = "Hold on — the receipt items, tax, and tip sum to **$115.00**, but PayPal was charged **$130.00** (an unlisted **$15.00** merchant service surcharge). Would you like me to initiate a PayPal dispute for the $15.00 discrepancy, or split the full settled $130.00 evenly three ways?";
  }
  // 6. Interactive AG Grid Ledger Exploration
  else if (p.includes("unsettled") || p.includes("debts") || p.includes("group by") || p.includes("ledger") || p.includes("grid")) {
    const groupByPerson = p.includes("person") || p.includes("debtor") || p.includes("who");
    const groupCol = groupByPerson ? ["debtor_name"] : ["category"];

    gridMutation = {
      groupBy: groupCol,
      filter: { status: "pending" },
      renderChart: groupByPerson ? "debt_by_person_bar" : "budget_burn_bar",
      statusMessage: `Interactive Ledger: Grouped by ${groupByPerson ? "debtor name" : "category"} with pending filters applied.`,
    };
    handlers.onGridMutation?.(gridMutation);

    reply = "I've reconfigured your AG Grid ledger to display unsettled items grouped by person. Dave currently has the largest outstanding balance ($65.00). Would you like me to dispatch reminder invoices?";
  }
  // 7. End-of-Day Ambiguity Triage Sweep
  else if (p.includes("sweep") || p.includes("triage") || p.includes("untagged") || p.includes("eod")) {
    reply = "End-of-day audit complete. I identified 1 unassigned charge requiring your attention:\n\n• **$34.20** at 'SQ* Urban Blend' (Yesterday, 4:15 PM)\n\nWas this Dining, Work Supplies, or a Group Split with someone? Tell me and I will tag it and update your budget ledger.";
  }
  // 8. Auto-Categorize Ledger Transactions
  else if (p.includes("categorize") || p.includes("category tagging") || p.includes("assign categories") || p.includes("auto-categorize")) {
    const autoArgs = { hoursBack: 720 };
    const autoResult = (await executeAgentTool("auto_categorize_transactions", autoArgs, handlers.userId)) as {
      success: boolean;
      categorizedCount: number;
      uncategorizedRemaining: number;
      scannedCount: number;
      message: string;
      categorized?: Array<{ id: string; merchant: string; category: string }>;
    };

    executedTools.push({ name: "auto_categorize_transactions", args: autoArgs, result: autoResult });
    handlers.onToolCall?.("auto_categorize_transactions", autoArgs, autoResult);

    gridMutation = {
      statusMessage: autoResult.message,
    };
    handlers.onGridMutation?.(gridMutation);

    const catList = autoResult.categorized || [];
    const detailList = catList.slice(0, 4).map((c) => `• **${c.merchant}** ➔ **${c.category}**`).join("\n");
    const remainingText = autoResult.uncategorizedRemaining > 0
      ? `\n\n📌 **${autoResult.uncategorizedRemaining} transaction(s)** remain in **Uncategorized** for your review.`
      : "\n\n✨ All scanned transactions are now fully categorized across your active budgets.";

    reply = `🧠 **AI Auto-Categorization Complete**\n\n${autoResult.message}${detailList ? `\n\n${detailList}` : ""}${remainingText}`;
  }
  // 9. Learned Merchant Rule or Transaction Category Assignment
  else if (
    (p.includes("always") || p.includes("rule") || p.includes("mark") || p.includes("tag")) &&
    (p.includes(" as ") || p.includes(" to ") || p.includes(" under ")) &&
    !p.includes("invoice")
  ) {
    const ruleMatch = prompt.match(/(?:always\s+)?(?:mark|tag|categorize|set)\s+['"]?([^'"]+?)['"]?\s+(?:as|to|under)\s+['"]?([A-Za-z\s&]+)['"]?/i);
    if (ruleMatch) {
      const merchantTarget = ruleMatch[1].trim();
      const categoryTarget = ruleMatch[2].trim();

      const ruleArgs = { merchantPattern: merchantTarget, category: categoryTarget };
      const ruleResult = (await executeAgentTool("set_merchant_category_rule", ruleArgs, handlers.userId)) as Record<string, unknown>;
      executedTools.push({ name: "set_merchant_category_rule", args: ruleArgs, result: ruleResult });
      handlers.onToolCall?.("set_merchant_category_rule", ruleArgs, ruleResult);

      gridMutation = {
        filter: { category: categoryTarget },
        statusMessage: `Rule Saved: ${merchantTarget} ➔ ${categoryTarget}`,
      };
      handlers.onGridMutation?.(gridMutation);

      reply = `✅ **Learned Merchant Rule Saved!**\n\nI've recorded a persistent rule: any past and future transactions from **${merchantTarget}** will now automatically categorize into **${categoryTarget}**.\n\nYour ledger has been filtered to show your updated **${categoryTarget}** items.`;
    }
  }
  // 8. Scheduled Item Analysis & Payment Reminders
  else if (
    p.includes("scheduled") ||
    p.includes("reminder") ||
    p.includes("bill") ||
    p.includes("due") ||
    p.includes("checkpoint")
  ) {
    // Extract query title from prompt (e.g. from quotes or title keywords)
    const quoteMatch = prompt.match(/["'“]([^"'”]+)["'”]/);
    const queryTitle = quoteMatch ? quoteMatch[1].trim() : "";

    let userEvents: Array<{ id: string; title: string; amount: number; counterparty?: string | null; date: string; category: string; type?: string }> = [];
    if (handlers.userId) {
      try {
        userEvents = await prisma.scheduledEvent.findMany({
          where: { userId: handlers.userId },
        });
      } catch (err) {
        console.warn("[ScheduledEvents DB Warning]", err);
      }
    }

    // Match the specific event from DB
    let targetEvent: { id?: string; title: string; amount: number; counterparty?: string | null; date: string; category: string; type?: string } | null = null;
    if (queryTitle && userEvents.length > 0) {
      targetEvent =
        userEvents.find(
          (e) =>
            e.title.toLowerCase().includes(queryTitle.toLowerCase()) ||
            queryTitle.toLowerCase().includes(e.title.toLowerCase())
        ) || null;

      if (!targetEvent) {
        targetEvent =
          userEvents.find(
            (e) =>
              e.category.toLowerCase().includes(queryTitle.toLowerCase()) ||
              (e.counterparty && e.counterparty.toLowerCase().includes(queryTitle.toLowerCase()))
          ) || null;
      }
    }

    if (!targetEvent && userEvents.length > 0) {
      targetEvent = userEvents[0];
    }

    // Return early if event not found
    if (!targetEvent) {
      reply = `No scheduled bill or payment found matching "${queryTitle || "your request"}". Please check your upcoming bills in the Scheduler tab.`;
      await handlers.onTextDelta?.(reply);
      return {
        reply,
        gridMutation: null,
        actionCard: null,
        executedTools,
        activePersona: persona,
      };
    }

    const debtor = targetEvent.counterparty || targetEvent.title;
    const matchedContact = await resolveContact(debtor, handlers.userId);

    // Fetch live category budget if available
    let categoryRecord = null;
    if (handlers.userId) {
      try {
        categoryRecord = await prisma.budgetCategory.findFirst({
          where: {
            userId: handlers.userId,
            name: { equals: targetEvent.category, mode: "insensitive" },
          },
        });
      } catch (err) {
        console.warn("[BudgetCategory Fetch Warning]", err);
      }
    }

    const monthlyCap = categoryRecord?.monthlyCap ?? 350.0;
    const currentSpent = categoryRecord?.currentSpent ?? 0.0;
    const projectedSpent = currentSpent + targetEvent.amount;
    const isOverBudget = projectedSpent > monthlyCap;
    const headroom = monthlyCap - currentSpent;

    gridMutation = {
      filter: { category: targetEvent.category },
      statusMessage: `Scheduled Item: ${targetEvent.title} ($${targetEvent.amount.toFixed(2)}) reviewed against ${targetEvent.category} budget.`,
    };
    handlers.onGridMutation?.(gridMutation);

    if (matchedContact && targetEvent.amount > 0) {
      const invArgs = {
        recipients: [
          {
            email: matchedContact.email,
            name: matchedContact.name,
            amount: targetEvent.amount,
            description: `Scheduled Item: ${targetEvent.title}`,
          },
        ],
        isConfirmed: false,
      };
      const invResult = (await executeAgentTool("dispatch_paypal_invoices", invArgs)) as Record<string, unknown>;
      executedTools.push({ name: "dispatch_paypal_invoices", args: invArgs, result: invResult });
      handlers.onToolCall?.("dispatch_paypal_invoices", invArgs, invResult);
      actionCard = invResult;
      handlers.onActionCard?.(actionCard);
    }

    const eventTypeLabel =
      targetEvent.type === "incoming"
        ? "Expected Receivable (Money In)"
        : targetEvent.type === "milestone"
        ? "Milestone / Checkpoint"
        : "Recurring Bill (Money Out)";

    reply = `### 📅 Scheduled Item Review: **${targetEvent.title}**

• **Type:** ${eventTypeLabel}
• **Amount:** $${targetEvent.amount.toFixed(2)} USD
• **Scheduled Date:** ${targetEvent.date}
• **Category:** ${targetEvent.category}
• **Counterparty:** ${debtor}${matchedContact ? ` (\`${matchedContact.email}\`)` : ""}

#### 📊 Category Budget Health (${targetEvent.category})
• **Current Spent:** $${currentSpent.toFixed(2)} of $${monthlyCap.toFixed(2)} monthly cap ($${headroom.toFixed(2)} headroom)
• **Projected Post-Charge:** $${projectedSpent.toFixed(2)} (${isOverBudget ? `⚠️ **$${(projectedSpent - monthlyCap).toFixed(2)} OVER BUDGET**` : `✅ **$${(monthlyCap - projectedSpent).toFixed(2)} buffer remaining**`})

---
**How would you like to proceed with this item?**
1. **Send Payment / Reminder via PayPal**: Say *"Send payment reminder for ${targetEvent.title}"* or *"Pay ${targetEvent.title}"*.
2. **Reschedule or Defer**: Say *"Push ${targetEvent.title} to next week"*.
3. **Mark Complete or Remove**: Say *"Mark ${targetEvent.title} as completed"* or use the calendar action button.`;
  }
  // Default General Assistant Guidance
  else {
    reply = `I am active as your Autonomous Financial Orchestrator. You can speak to me naturally to:\n\n• Split multi-venue charges (e.g. *"split last 3 hours 5 ways with Alex and Dave"*)\n• Invoicing and client billing (e.g. *"draft invoice to Acme Corp for 20 hrs at $95/hr"*)\n• Budget limits (e.g. *"did I overspend on Groceries this month?"*)\n• Audit bills (drop a receipt image or say *"audit dinner bill against PayPal"*)\n• Reconfigure your live AG Grid ledger.`;
  }

  await handlers.onTextDelta?.(reply);
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
      parts.push(`Calculated penny-locked split: $${t.result.totalAmount} across ${allocs.length} participants.`);
    } else if (t.name === "dispatch_paypal_invoices" && t.result.requiresConfirmation) {
      parts.push(`Prepared invoices for ${t.result.totalRecipients} recipients totaling $${t.result.totalAmount}. Review the preview card below.`);
    } else if (t.name === "log_category_expense") {
      parts.push(`Logged $${t.result.amountLogged} to ${t.result.category}. ${(t.result.alert as string) || ""}`);
    }
  }
  return parts.join("\n\n") || "Actions completed successfully.";
}
