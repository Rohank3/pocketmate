import { assembleSystemPrompt, PersonaType } from "./prompts";
import { agentToolDeclarations, executeAgentTool } from "./tools";
import { GridMutationState, ToolExecutionRecord, AgentRunResult } from "@/types/agent";
import { paypalClient } from "@/lib/paypal/client";
import { resolveContact } from "@/lib/contacts/contactResolver";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { loadUserCategorizationContext, categorizeTransactionsBatch } from "@/lib/services/categorizer";
import {
  calculateDifferentialSplit,
} from "@/lib/math/split";

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
    const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";
    let geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${apiKey}`;

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

    let res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok && (res.status === 429 || res.status === 503 || res.status === 404)) {
      geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
      res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
    }

    if (!res.ok) {
      console.warn(`[Gemini API] Returned HTTP ${res.status}. Falling back to dynamic autonomous engine.`);
      return handleDynamicAutonomousResponse(lastUserMsg, persona, {
        userId,
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
      userId,
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

  // --------------------------------------------------------------------------
  // A. Review Incoming PayPal Invoice (e.g. from banner or quick action)
  // e.g. "Review incoming invoice INV2-8UM5-HXTK-NH6M-QRHV for $32.50 from Bowlero Lanes Entertainment & Shoes"
  // --------------------------------------------------------------------------
  const isInvoiceReviewIntent =
    (p.includes("review") && p.includes("invoice")) ||
    p.includes("inv2-") ||
    (p.includes("incoming") && p.includes("invoice"));

  // --------------------------------------------------------------------------
  // B. Budget Cap Breach & Category Cost Optimization
  // e.g. "PocketMate, my Dining budget has breached its $250 cap by $9.75. Please review category transactions and suggest cost optimizations."
  // --------------------------------------------------------------------------
  const isBudgetBreachIntent =
    (p.includes("breached") ||
      p.includes("breach") ||
      p.includes("cap") ||
      p.includes("cost optimization") ||
      p.includes("overrun") ||
      p.includes("overspend")) &&
    (p.includes("budget") ||
      p.includes("dining") ||
      p.includes("groceries") ||
      p.includes("shopping") ||
      p.includes("entertainment") ||
      p.includes("travel"));

  // --------------------------------------------------------------------------
  // C. Conversational One-by-One Uncategorized Triage Wizard
  // e.g. "triage", "prompt me to uncategorized one by one", "help me categorize"
  // --------------------------------------------------------------------------
  const isTriageIntent =
    p.includes("one by one") ||
    p.includes("step by step") ||
    p.includes("triage") ||
    (p.includes("uncategorized") &&
      (p.includes("guide") ||
        p.includes("prompt") ||
        p.includes("review") ||
        p.includes("help") ||
        p.includes("walk through")));

  // --------------------------------------------------------------------------
  // D. Triage Selection Response (User replying with category selection 1-5 or category name)
  // --------------------------------------------------------------------------
  const isTriageResponse =
    /^(1|2|3|4|5)$/.test(p.trim()) ||
    ["travel", "dining", "shopping", "groceries", "entertainment", "services", "utilities", "software", "miscellaneous", "mislenious"].includes(p.trim()) ||
    /(?:mark|tag|set|categorize|make it|put as|put in)\s+/i.test(p.trim()) ||
    (p.trim().split(/\s+/).length <= 3 &&
      !p.includes("split") &&
      !p.includes("bill") &&
      !p.includes("remind") &&
      !p.includes("pay ") &&
      !p.includes("invoice") &&
      !p.includes("due") &&
      !p.includes("cap") &&
      !p.includes("overspend"));

  // --------------------------------------------------------------------------
  // E. Explicit Payment Reminder Intent (Sending reminder invoice to a debtor)
  // e.g. "Draft a PayPal payment reminder for Dave Chen for $65.00"
  // --------------------------------------------------------------------------
  const isPaymentReminderIntent =
    (p.includes("reminder") || p.includes("remind")) &&
    (p.includes("draft") || p.includes("send") || p.includes("dispatch") || p.includes("friendly") || p.includes("owed") || p.includes("$") || p.includes("₹") || p.includes("for") || p.includes("to")) &&
    !p.includes("remind me to");

  // --------------------------------------------------------------------------
  // F. Add / Schedule Recurring Bill or Calendar Expense
  // e.g. "add my rent of $1,200 due on the 1st of every month", "schedule electric bill $85"
  // --------------------------------------------------------------------------
  const isAddBillIntent =
    (p.startsWith("add") || p.startsWith("schedule") || p.includes("create bill") || p.includes("add bill") || p.includes("add my rent") || p.includes("add rent") || p.includes("remind me to pay")) &&
    (p.includes("rent") || p.includes("bill") || p.includes("subscription") || p.includes("utility") || p.includes("utilities") || p.includes("electricity") || p.includes("wifi") || p.includes("internet") || p.includes("water") || p.includes("insurance") || p.includes("gym") || p.includes("due"));

  // Direct Peer Settlement / Transfer via PayPal Payouts API
  const isPayoutIntent =
    (p.startsWith("pay") ||
      p.startsWith("send") ||
      p.startsWith("transfer") ||
      p.includes("payout") ||
      p.includes("reimburse") ||
      (p.includes("settle") && !p.includes("split"))) &&
    !p.includes("invoice") &&
    !p.includes("bill me") &&
    !isPaymentReminderIntent &&
    !isAddBillIntent;

  if (isInvoiceReviewIntent) {
    const effectiveUserId = handlers.userId || "demo_user";
    const filterEmail = effectiveUserId.includes("@") ? effectiveUserId : undefined;
    const liveTxs = await paypalClient.fetchRecentTransactions(720, filterEmail).catch(() => []);

    // 1. Identify invoice ID dynamically from prompt or live sandbox invoices
    const invMatch = prompt.match(/(INV2-[A-Z0-9-]+)/i) || prompt.match(/invoice\s+([A-Z0-9-]+)/i);
    const requestedInvId = invMatch ? invMatch[1].toUpperCase() : null;

    const matchedTx = requestedInvId
      ? liveTxs.find((t) => t.id.toUpperCase() === requestedInvId)
      : liveTxs.find((t) => t.id.startsWith("INV2-") && t.status === "PENDING") ||
        liveTxs.find((t) => t.id.startsWith("INV2-"));

    const invoiceId = matchedTx?.id || requestedInvId || "INV2-PENDING";

    // 2. Identify amount dynamically
    const amtMatch = prompt.match(/\$([0-9]+(?:\.[0-9]{1,2})?)/);
    const amount = matchedTx ? matchedTx.amount : amtMatch ? parseFloat(amtMatch[1]) : 0.0;

    // 3. Identify merchant/payee dynamically
    const fromMatch = prompt.match(/from\s+([^.\n]+)/i);
    const merchant = matchedTx?.merchantName || (fromMatch ? fromMatch[1].trim() : "PayPal Commercial Payee");

    // 4. Fetch real authenticated user details dynamically from DB
    let userRecord = null;
    if (handlers.userId) {
      userRecord = await prisma.user.findUnique({ where: { id: handlers.userId } }).catch(() => null);
    }
    const recipientName = userRecord?.name || "Dave Chen";
    const recipientEmail = userRecord?.email || filterEmail || "dave.chen.pm@personal.example.com";

    // 5. Determine category & budget impact dynamically from DB
    const catContext = await loadUserCategorizationContext(effectiveUserId);
    const catRes = await categorizeTransactionsBatch(
      [{ id: invoiceId, merchantName: merchant, amount, note: matchedTx?.memo }],
      catContext
    );
    const categoryName = catRes.get(invoiceId)?.category || "General";

    const budgetCat = await prisma.budgetCategory.findFirst({
      where: {
        userId: effectiveUserId,
        name: { equals: categoryName, mode: "insensitive" },
      },
    }).catch(() => null);

    const monthlyCap = budgetCat?.monthlyCap ?? 300.0;
    const currentSpent = budgetCat?.currentSpent ?? 0.0;
    const projectedSpend = currentSpent + amount;
    const remainingHeadroom = monthlyCap - projectedSpend;

    gridMutation = {
      highlightRowId: invoiceId,
      statusMessage: `Reviewing incoming invoice ${invoiceId} ($${amount.toFixed(2)}) from ${merchant}.`,
    };
    handlers.onGridMutation?.(gridMutation);

    actionCard = {
      type: "incoming_invoice_review",
      invoiceId,
      amount,
      merchant,
      recipientName,
      recipientEmail,
      category: categoryName,
      requiresConfirmation: true,
      actions: [
        { label: `Pay via PayPal Sandbox ($${amount.toFixed(2)})`, action: "pay_invoice", variant: "primary" },
        { label: "Split with Friends", action: "split_invoice", variant: "secondary" },
        { label: "Dispute / Decline", action: "dispute_invoice", variant: "danger" },
      ],
    };
    handlers.onActionCard?.(actionCard);

    const budgetImpactText = remainingHeadroom >= 0
      ? `Leaves **$${remainingHeadroom.toFixed(2)} buffer remaining** under your $${monthlyCap.toFixed(2)} monthly ceiling.`
      : `⚠️ Pushes **$${Math.abs(remainingHeadroom).toFixed(2)} over** your $${monthlyCap.toFixed(2)} monthly ceiling!`;

    reply = `### 🧾 Incoming Invoice Review: **${merchant}**

• **Invoice ID:** \`${invoiceId}\`
• **Amount Due:** **$${amount.toFixed(2)} USD**
• **Billed To:** ${recipientName} (\`${recipientEmail}\`)
• **Category Impact:** **${categoryName}** (${budgetImpactText})
• **Settlement Status:** ⏳ Pending Payment Clearing

---
#### ⚡ Single-Tap Sandbox Actions:
1. **Pay via PayPal Sandbox**: Instantly settle **$${amount.toFixed(2)}** via your linked sandbox buyer wallet.
2. **Split with Friends**: Divide this invoice across your group (e.g. *"split this $${amount.toFixed(2)} invoice 3 ways with Alex and Sam"*).
3. **Dispute / Decline**: Flag unauthorized billing or billing mismatch under PayPal Buyer Protection.

Review the action card below to execute or reply with your preferred action.`;
  } else if (isBudgetBreachIntent) {
    const effectiveUserId = handlers.userId || "demo_user";
    const filterEmail = effectiveUserId.includes("@") ? effectiveUserId : undefined;

    // 1. Fetch user's actual categories from database
    const userCategories = await prisma.budgetCategory.findMany({
      where: { userId: effectiveUserId },
    }).catch(() => []);

    // 2. Determine target category dynamically from prompt or highest overrun
    let targetCat = userCategories.find((c) => p.includes(c.name.toLowerCase()));

    if (!targetCat) {
      const overCat = userCategories
        .filter((c) => c.currentSpent > c.monthlyCap)
        .sort((a, b) => (b.currentSpent - b.monthlyCap) - (a.currentSpent - a.monthlyCap))[0];
      targetCat = overCat || userCategories[0];
    }

    const categoryName = targetCat?.name || "Dining";

    // 3. Fetch real live transactions and map categories dynamically
    const liveTxs = await paypalClient.fetchRecentTransactions(720, filterEmail).catch(() => []);
    const catContext = await loadUserCategorizationContext(effectiveUserId);
    const categoryMap = await categorizeTransactionsBatch(
      liveTxs.map((t) => ({ id: t.id, merchantName: t.merchantName, amount: t.amount, note: t.memo })),
      catContext
    );

    // 4. Filter real live transactions belonging to this category
    const categoryTxs = liveTxs.filter((t) => {
      const cat = categoryMap.get(t.id)?.category || "Uncategorized";
      return cat.toLowerCase() === categoryName.toLowerCase();
    });

    // 5. Reconcile cap, spent, and overrun dynamically
    const promptCapMatch = prompt.match(/\$([0-9]+(?:\.[0-9]{1,2})?)\s*cap/i) || prompt.match(/cap\s*(?:of)?\s*\$([0-9]+(?:\.[0-9]{1,2})?)/i);
    const promptBreachMatch = prompt.match(/by\s*\$([0-9]+(?:\.[0-9]{1,2})?)/i) || prompt.match(/over\s*\$([0-9]+(?:\.[0-9]{1,2})?)/i);

    const calculatedSpent = categoryTxs.reduce((sum, t) => sum + t.amount, 0);
    const monthlyCap = promptCapMatch
      ? parseFloat(promptCapMatch[1])
      : targetCat?.monthlyCap ?? 250.0;

    const currentSpent = calculatedSpent > 0
      ? calculatedSpent
      : promptBreachMatch
      ? monthlyCap + parseFloat(promptBreachMatch[1])
      : targetCat?.currentSpent ?? monthlyCap;

    const overrunAmount = Math.max(0, currentSpent - monthlyCap);
    const percentUsed = monthlyCap > 0 ? ((currentSpent / monthlyCap) * 100).toFixed(0) : "100";

    // 6. Extract real key spending drivers dynamically from actual transactions
    const sortedTxs = [...categoryTxs].sort((a, b) => b.amount - a.amount);
    const topTxs = sortedTxs.slice(0, 4);

    const driversMarkdown = topTxs.length > 0
      ? topTxs
          .map((t, idx) => {
            const pct = currentSpent > 0 ? ((t.amount / currentSpent) * 100).toFixed(0) : "0";
            const memoPart = t.memo && t.memo.toLowerCase() !== t.merchantName.toLowerCase() ? ` *("${t.memo}")*` : "";
            const discrepancyTag = t.status === "disputed" ? " — ⚠️ *Discrepancy flagged*" : "";
            return `${idx + 1}. **${t.merchantName}**: **$${t.amount.toFixed(2)}** (${pct}% of category spend)${memoPart}${discrepancyTag}`;
          })
          .join("\n")
      : `• No individual charges found under **${categoryName}**.`;

    // 7. Generate dynamic actionable optimizations based on real data
    const optimizationList: string[] = [];
    if (topTxs.length > 0) {
      const highest = topTxs[0];
      const highestShare3Ways = (highest.amount * 2 / 3).toFixed(2);
      optimizationList.push(
        `**Split the Largest Expense (${highest.merchantName})**: If your **$${highest.amount.toFixed(2)}** charge at **${highest.merchantName}** was shared, say *"split $${highest.amount.toFixed(0)} with friends"* to recoup **$${highestShare3Ways}** in accounts receivable.`
      );
    }

    if (topTxs.length > 1) {
      const second = topTxs[1];
      optimizationList.push(
        `**Reallocate Recurring Charges**: Moving recurring or work-related expenses like **${second.merchantName}** ($${second.amount.toFixed(2)}) to Business/Services preserves personal ${categoryName} headroom.`
      );
    }

    if (overrunAmount > 0) {
      optimizationList.push(
        `**Ceiling Recovery**: Reducing or recovering **$${overrunAmount.toFixed(2)}** immediately restores your **${categoryName}** budget to 100% compliance with your $${monthlyCap.toFixed(2)} ceiling.`
      );
    } else {
      optimizationList.push(
        `**Healthy Headroom**: You currently have **$${(monthlyCap - currentSpent).toFixed(2)}** in remaining headroom under your monthly cap.`
      );
    }

    const optimizationsMarkdown = optimizationList.map((opt, i) => `${i + 1}. ${opt}`).join("\n");

    gridMutation = {
      filter: { category: categoryName },
      renderChart: "budget_burn_bar",
      statusMessage: `Auditing ${categoryName} budget: $${currentSpent.toFixed(2)} spent of $${monthlyCap.toFixed(2)} cap (${overrunAmount > 0 ? `$${overrunAmount.toFixed(2)} over ceiling` : "within budget"}).`,
    };
    handlers.onGridMutation?.(gridMutation);

    reply = `### 📊 Budget Optimization Audit: **${categoryName}**

• **Monthly Cap:** $${monthlyCap.toFixed(2)}
• **Current Spend:** $${currentSpent.toFixed(2)} (${overrunAmount > 0 ? `⚠️ **$${overrunAmount.toFixed(2)} over ceiling** — ${percentUsed}% utilized` : `✅ **Within budget** — ${percentUsed}% utilized`})
• **Active Charges:** ${categoryTxs.length} transaction(s) recorded in ${categoryName}

#### 🔍 Key Spending Drivers:
${driversMarkdown}

---
#### 💡 Actionable Cost Optimizations:
${optimizationsMarkdown}`;
  } else if (isTriageIntent) {
    const effectiveUserId = handlers.userId || "demo_user";
    const filterEmail = effectiveUserId.includes("@") ? effectiveUserId : undefined;
    const liveTxs = await paypalClient.fetchRecentTransactions(720, filterEmail).catch(() => []);

    let existingOverrides: Array<{ transactionId: string; categoryName: string }> = [];
    try {
      existingOverrides = await prisma.transactionCategoryOverride.findMany({
        where: { userId: effectiveUserId },
        select: { transactionId: true, categoryName: true },
      });
    } catch (dbErr) {
      console.warn("[Triage DB Warning]", dbErr);
    }

    const overriddenIds = new Set(
      existingOverrides
        .filter((o) => o.categoryName.toLowerCase() !== "uncategorized")
        .map((o) => o.transactionId)
    );

    const uncategorizedTxs = liveTxs.filter((t) => !overriddenIds.has(t.id));

    if (uncategorizedTxs.length === 0) {
      gridMutation = {
        filter: { category: "all" },
        statusMessage: "All transactions are fully categorized across your active budgets.",
      };
      handlers.onGridMutation?.(gridMutation);

      reply = `🎉 **Ledger Reconciled!**\n\nAll ${liveTxs.length} transactions in your PayPal sandbox ledger are already categorized across your active budgets.\n\nYou can review your spending breakdown in the **Insights** tab or say *"did I overspend on Groceries this month?"*`;
    } else {
      const nextTx = uncategorizedTxs[0];

      // Dynamically determine AI suggested category
      const catContext = await loadUserCategorizationContext(effectiveUserId);
      const catRes = await categorizeTransactionsBatch(
        [{ id: nextTx.id, merchantName: nextTx.merchantName, amount: nextTx.amount, note: nextTx.memo }],
        catContext
      );
      const suggestedCategory = catRes.get(nextTx.id)?.category || "Shopping";

      // Load active user categories dynamically from DB
      const userCategories = await prisma.budgetCategory.findMany({
        where: { userId: effectiveUserId },
        select: { name: true },
        orderBy: { createdAt: "asc" },
      }).catch(() => []);

      const activeCatNames = userCategories.length > 0
        ? userCategories.map((c) => c.name)
        : ["Dining", "Groceries", "Shopping", "Entertainment", "Travel"];

      const optionsLines = activeCatNames
        .slice(0, 5)
        .map((name, i) => `• Reply **${i + 1}** for **${name}**`)
        .join("\n");

      gridMutation = {
        highlightRowId: nextTx.id,
        filter: { category: "Uncategorized" },
        statusMessage: `Triage Mode (1 of ${uncategorizedTxs.length}): Reviewing ${nextTx.merchantName} ($${nextTx.amount.toFixed(2)})`,
      };
      handlers.onGridMutation?.(gridMutation);

      const dateStr = new Date(nextTx.timestamp).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
      const memoLine = nextTx.memo && nextTx.memo.toLowerCase() !== nextTx.merchantName.toLowerCase()
        ? `• **Memo / Item:** ${nextTx.memo}\n`
        : "";

      reply = `### 🔍 Interactive Triage (1 of ${uncategorizedTxs.length} Uncategorized)

I've highlighted the next uncategorized item on your AG Grid ledger:

• **Merchant / Payee:** **${nextTx.merchantName}**
• **Amount:** **$${nextTx.amount.toFixed(2)} USD**
${memoLine}• **Date:** ${dateStr}
• **Settlement Status:** ${nextTx.status === "COMPLETED" ? "Cleared & Settled" : "Pending Authorization"}

💡 **AI Recommended Category:** **${suggestedCategory}**

---
**Choose how to categorize this item:**
${optionsLines}
• Or reply with any custom category name!`;
    }
  } else if (isTriageResponse) {
    const effectiveUserId = handlers.userId || "demo_user";
    const filterEmail = effectiveUserId.includes("@") ? effectiveUserId : undefined;
    const liveTxs = await paypalClient.fetchRecentTransactions(720, filterEmail).catch(() => []);

    let existingOverrides: Array<{ transactionId: string; categoryName: string }> = [];
    try {
      existingOverrides = await prisma.transactionCategoryOverride.findMany({
        where: { userId: effectiveUserId },
        select: { transactionId: true, categoryName: true },
      });
    } catch (dbErr) {
      console.warn("[Triage DB Warning]", dbErr);
    }

    const overriddenIds = new Set(
      existingOverrides
        .filter((o) => o.categoryName.toLowerCase() !== "uncategorized")
        .map((o) => o.transactionId)
    );

    const uncategorizedTxs = liveTxs.filter((t) => !overriddenIds.has(t.id));

    if (uncategorizedTxs.length > 0) {
      const currentTx = uncategorizedTxs[0];

      // Load active user categories dynamically from DB
      const userCategories = await prisma.budgetCategory.findMany({
        where: { userId: effectiveUserId },
        select: { name: true },
        orderBy: { createdAt: "asc" },
      }).catch(() => []);

      const activeCatNames = userCategories.length > 0
        ? userCategories.map((c) => c.name)
        : ["Dining", "Groceries", "Shopping", "Entertainment", "Travel"];

      // Map choice to target category
      const cleanInput = p.trim();
      let chosenCategory = activeCatNames[0] || "General";

      if (/^[1-5]$/.test(cleanInput)) {
        const idx = parseInt(cleanInput, 10) - 1;
        chosenCategory = activeCatNames[idx] || activeCatNames[0] || "General";
      } else {
        const phraseMatch = cleanInput.match(/(?:mark|tag|set|categorize|make it|put as|put in)\s+(?:as\s+)?([a-z0-9\s]+)/i);
        const candidateWord = phraseMatch ? phraseMatch[1].trim() : cleanInput;
        const matchedActive = activeCatNames.find((c) => c.toLowerCase() === candidateWord.toLowerCase());
        chosenCategory = matchedActive || candidateWord.charAt(0).toUpperCase() + candidateWord.slice(1).toLowerCase();
      }

      // Persist category override
      try {
        await prisma.transactionCategoryOverride.upsert({
          where: {
            userId_transactionId: {
              userId: effectiveUserId,
              transactionId: currentTx.id,
            },
          },
          update: { categoryName: chosenCategory },
          create: {
            userId: effectiveUserId,
            transactionId: currentTx.id,
            categoryName: chosenCategory,
          },
        });
      } catch (err) {
        console.warn("[Triage Upsert Warning]", err);
      }

      // Check if more uncategorized transactions remain
      const remainingTxs = uncategorizedTxs.slice(1);

      if (remainingTxs.length === 0) {
        gridMutation = {
          filter: { category: "all" },
          statusMessage: `Tagged ${currentTx.merchantName} as ${chosenCategory}. All transactions are now categorized!`,
        };
        handlers.onGridMutation?.(gridMutation);

        reply = `✅ Tagged **${currentTx.merchantName}** ($${currentTx.amount.toFixed(2)}) as **${chosenCategory}**.\n\n🎉 **All done!** Every transaction in your ledger has been categorized. Your budget balances and charts are fully reconciled!`;
      } else {
        const nextTx = remainingTxs[0];

        // Determine AI recommendation for next item
        const catContext = await loadUserCategorizationContext(effectiveUserId);
        const nextCatRes = await categorizeTransactionsBatch(
          [{ id: nextTx.id, merchantName: nextTx.merchantName, amount: nextTx.amount, note: nextTx.memo }],
          catContext
        );
        const nextSuggested = nextCatRes.get(nextTx.id)?.category || "Shopping";

        const optionsLines = activeCatNames
          .slice(0, 5)
          .map((name, i) => `• Reply **${i + 1}** for **${name}**`)
          .join("\n");

        gridMutation = {
          highlightRowId: nextTx.id,
          filter: { category: "Uncategorized" },
          statusMessage: `Tagged ${currentTx.merchantName} as ${chosenCategory}. Reviewing ${nextTx.merchantName} (${remainingTxs.length} remaining).`,
        };
        handlers.onGridMutation?.(gridMutation);

        const dateStr = new Date(nextTx.timestamp).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
        const memoLine = nextTx.memo && nextTx.memo.toLowerCase() !== nextTx.merchantName.toLowerCase()
          ? `• **Memo / Item:** ${nextTx.memo}\n`
          : "";

        reply = `✅ Tagged **${currentTx.merchantName}** as **${chosenCategory}**!\n\n---
### 🔍 Next Item (${remainingTxs.length} remaining):

• **Merchant / Payee:** **${nextTx.merchantName}**
• **Amount:** **$${nextTx.amount.toFixed(2)} USD**
${memoLine}• **Date:** ${dateStr}

💡 **AI Recommended:** **${nextSuggested}**

**Choose how to categorize this item:**
${optionsLines}
• Or reply with any custom category name!`;
      }
    } else {
      reply = `All transactions are currently categorized! If you want to change any category, click the category badge directly in the AG Grid ledger or tell me (e.g. *"mark Grand Vista Hotel as Travel"*).`;
    }
  }

  // 1. Explicit Payment Reminder Intent (Sending invoice reminder to a counterparty/debtor)
  // e.g. "Draft a PayPal payment reminder for Dave Chen for $65.00"
  else if (isPaymentReminderIntent) {
    const dollarMatch = prompt.match(/\$([0-9]+(?:\.[0-9]{1,2})?)/) ||
                        prompt.match(/(?:₹|rs\.?|usd)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    const reminderAmount = dollarMatch ? parseFloat(dollarMatch[1]) : 65.0;

    let targetName = "";
    const nameMatch =
      prompt.match(/reminder\s+(?:to|for)\s+([A-Za-z0-9\s&]+?)(?:\s+for|\s+at|\s+\$|\s+₹|owed|$)/i) ||
      prompt.match(/(?:remind|invoice)\s+([A-Za-z0-9\s&]+?)(?:\s+for|\s+at|\s+\$|\s+₹|about|$)/i);
    if (nameMatch && nameMatch[1]?.trim()) {
      targetName = nameMatch[1].trim();
    }

    if (!targetName) {
      targetName = "Dave Chen";
    }

    let currentUserName = "";
    if (handlers.userId) {
      try {
        const u = await prisma.user.findUnique({ where: { id: handlers.userId }, select: { name: true } });
        if (u?.name) currentUserName = u.name.trim();
      } catch {
        // ignore
      }
    }

    // Safety check: Prevent user from invoicing themselves
    if (
      targetName.toLowerCase().includes("self") ||
      (currentUserName && targetName.toLowerCase() === currentUserName.toLowerCase())
    ) {
      reply = `**${targetName}** matches your own registered account name. Payment reminders cannot be issued to yourself. To collect split expenses from friends, please specify a counterparty (e.g. *"Draft a payment reminder for Alex Morgan for $${reminderAmount.toFixed(2)}"*).`;
      await handlers.onTextDelta?.(reply);
      return {
        reply,
        gridMutation: null,
        actionCard: null,
        executedTools,
        activePersona: persona,
      };
    }

    const matchedContact = await resolveContact(targetName, handlers.userId);
    const recipientEmail = matchedContact
      ? matchedContact.email
      : targetName.includes("@")
      ? targetName
      : `${targetName.toLowerCase().replace(/\s+/g, ".")}@personal.example.com`;
    const recipientName = matchedContact ? matchedContact.name : targetName;

    const invArgs = {
      recipients: [
        {
          email: recipientEmail,
          name: recipientName,
          amount: reminderAmount,
          description: `Payment reminder for split balance (${recipientName})`,
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
      filter: { debtor_name: recipientName },
      statusMessage: `Payment Reminder: Drafted $${reminderAmount.toFixed(2)} reminder invoice for ${recipientName}.`,
    };
    handlers.onGridMutation?.(gridMutation);

    reply = `### 📨 Payment Reminder Drafted: **${recipientName}**\n\n• **Recipient:** ${recipientName} (\`${recipientEmail}\`)\n• **Outstanding Balance:** **$${reminderAmount.toFixed(2)} USD**\n• **Rail:** PayPal Invoicing API (Payment Reminder)\n\nPlease review the invoice reminder card below and tap **Confirm & Send Invoices** to dispatch the notification directly to ${recipientName}.`;
  }

  // 1.5. Add / Schedule Bill or Recurring Expense Intent
  // e.g. "add my rent of $1,200 due on the 1st of every month", "schedule electric bill $85"
  else if (isAddBillIntent) {
    const amtMatch = prompt.match(/(?:[₹$]|rs\.?|usd)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i);
    const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, "")) : 100.0;

    const dayMatch =
      prompt.match(/(?:due\s+on\s+(?:the\s+)?|every\s+(?:month\s+on\s+the\s+)?)([0-9]{1,2})(?:st|nd|rd|th)?/i) ||
      prompt.match(/([0-9]{1,2})(?:st|nd|rd|th)\s+of\s+every\s+month/i);
    const dayOfMonth = dayMatch ? parseInt(dayMatch[1], 10) : 1;

    let title = "Recurring Bill";
    let category = "General";
    let counterparty = "Utility Provider";

    if (p.includes("rent")) {
      title = "Apartment Rent";
      category = "Rent";
      counterparty = "Landlord / Property Management";
    } else if (p.includes("electric") || p.includes("power")) {
      title = "Electric Utility";
      category = "Utilities";
      counterparty = "Power & Electric Co";
    } else if (p.includes("water") || p.includes("gas")) {
      title = "Water & Gas Utility";
      category = "Utilities";
      counterparty = "City Utility Service";
    } else if (p.includes("internet") || p.includes("wifi") || p.includes("broadband")) {
      title = "High-Speed Internet";
      category = "Utilities";
      counterparty = "Broadband Provider";
    } else if (p.includes("insurance")) {
      title = "Insurance Premium";
      category = "Services";
      counterparty = "Insurance Underwriter";
    } else if (p.includes("netflix")) {
      title = "Netflix Subscription";
      category = "Entertainment";
      counterparty = "Netflix";
    } else if (p.includes("spotify")) {
      title = "Spotify Premium";
      category = "Entertainment";
      counterparty = "Spotify";
    } else if (p.includes("gym") || p.includes("fitness")) {
      title = "Gym Membership";
      category = "Personal";
      counterparty = "Fitness Center";
    } else {
      const titleMatch = prompt.match(/add\s+(?:my\s+)?([^$0-9]+?)(?:\s+of|\s+for|\s+\$|\s+due|$)/i);
      if (titleMatch && titleMatch[1].trim()) {
        title = titleMatch[1].trim();
        counterparty = title;
      }
    }

    const eventResult = (await executeAgentTool(
      "add_scheduled_event",
      {
        title,
        amount,
        dayOfMonth,
        type: "outgoing",
        category,
        counterparty,
      },
      handlers.userId,
      true
    )) as Record<string, unknown>;

    executedTools.push({ name: "add_scheduled_event", args: { title, amount, dayOfMonth }, result: eventResult });
    handlers.onToolCall?.("add_scheduled_event", { title, amount, dayOfMonth }, eventResult);

    gridMutation = {
      filter: { category },
      statusMessage: `Scheduled Bill Added: ${title} ($${amount.toFixed(2)}) due on the ${dayOfMonth}th.`,
    };
    handlers.onGridMutation?.(gridMutation);

    reply = `### 📅 Recurring Bill Scheduled: **${title}**\n\n• **Amount:** **$${amount.toFixed(2)} USD**\n• **Due Date:** **Day ${dayOfMonth} of every month**\n• **Category:** **${category}**\n• **Counterparty:** ${counterparty}\n\nI've recorded this in your financial calendar and will reconcile incoming PayPal charges automatically when they settle!`;
  }

  // 2. Direct Peer Settlement / Transfer via PayPal Payouts API
  // e.g. "Pay Dave $50", "Send $30 to Sarah", "Transfer $45 to Dave Chen", "Settle $65 with Dave"
  else if (isPayoutIntent) {
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
  // e.g. "I paid ₹2,000 for dinner with Alex and Sam", "split $120 3 ways", "split 1500: Alex owes 800, Sam 700"
  else if (
    p.includes("split") ||
    p.includes("divide") ||
    p.includes("share") ||
    p.includes("ways") ||
    (p.includes("paid") && (p.includes("with") || p.includes("between") || p.includes("dinner") || p.includes("lunch")))
  ) {
    let splitAmount = 0;
    let hostEmail = "host@paypal.sandbox";
    if (handlers.userId) {
      const u = await prisma.user.findUnique({ where: { id: handlers.userId } }).catch(() => null);
      if (u?.email) hostEmail = u.email;
    }
    const participantsList: { name: string; emailOrHandle: string; customAmount?: number; percentage?: number }[] = [
      { name: "You (Host)", emailOrHandle: hostEmail },
    ];
    let splitMemo = "Shared Expenses";

    // Currency & Amount Detection (₹ INR, $ USD, or bare numbers)
    const inrMatch = prompt.match(/(?:₹|rs\.?|inr)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i);
    const usdMatch =
      prompt.match(/\$([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/) ||
      prompt.match(/(?:usd|\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i) ||
      prompt.match(/(?:split|paid|spent|for)\s+([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i);

    let currencyCode = "USD";
    let currencySymbol = "$";

    if (inrMatch) {
      splitAmount = parseFloat(inrMatch[1].replace(/,/g, ""));
      currencyCode = "INR";
      currencySymbol = "₹";
      splitMemo = `Shared Expense (₹${splitAmount.toFixed(2)})`;
    } else if (usdMatch) {
      splitAmount = parseFloat(usdMatch[1].replace(/,/g, ""));
      currencyCode = "USD";
      currencySymbol = "$";
      splitMemo = `Shared Expense ($${splitAmount.toFixed(2)})`;
    }

    // Dynamic Transaction Lookup: If bill/merchant is mentioned or amount is missing, query live PayPal transactions
    let matchedTransaction: { id: string; merchantName: string; amount: number; memo?: string } | null = null;
    const looksLikeTransactionRef =
      splitAmount === 0 ||
      p.includes("bill") ||
      p.includes("hotel") ||
      p.includes("grand") ||
      p.includes("dinner") ||
      p.includes("uber") ||
      p.includes("bistro") ||
      p.includes("bowlero") ||
      p.includes("charge");

    if (looksLikeTransactionRef) {
      try {
        const liveTxs = await paypalClient.fetchRecentTransactions(720);
        // Find best matching transaction in ledger
        for (const tx of liveTxs) {
          const m = tx.merchantName.toLowerCase();
          const memo = (tx.memo || "").toLowerCase();
          const tokens = m.split(/[\s-_]+/).filter((w) => w.length > 2);
          if (
            p.includes(m) ||
            tokens.some((t) => p.includes(t)) ||
            (memo && memo.length > 2 && p.includes(memo))
          ) {
            matchedTransaction = tx;
            break;
          }
        }
      } catch (err) {
        console.warn("[Split Transaction Lookup Warning]", err);
      }

      if (matchedTransaction) {
        splitAmount = matchedTransaction.amount;
        splitMemo = matchedTransaction.memo
          ? `${matchedTransaction.merchantName} (${matchedTransaction.memo})`
          : `${matchedTransaction.merchantName} Bill Split`;
      }
    }

    // Check if temporal query (e.g. "last 3 hours", "last 24 hours")
    const hoursMatch = prompt.match(/(\d+)\s*(?:hours|hrs)/i);
    const hoursBack = hoursMatch ? parseFloat(hoursMatch[1]) : 3;

    if (splitAmount === 0 && (p.includes("last") || p.includes("recent") || p.includes("charges") || p.includes("expenses"))) {
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
      }
    }

    if (splitAmount === 0) {
      reply = `I couldn't detect a total amount or matching transaction to split. Please mention the bill name or dollar amount (e.g. *"split $480 Grand Vista hotel bill with Mark, Oliver and Leo"*).`;
      await handlers.onTextDelta?.(reply);
      return {
        reply,
        gridMutation: null,
        actionCard: null,
        executedTools,
        activePersona: persona,
      };
    }

    // -------------------------------------------------------------------------
    // Comprehensive Participant Extraction: Supports lists ("among me, mark, oliver and leo")
    // and differential conditions ("Leo only owes 60, split the rest evenly among the three of us")
    // -------------------------------------------------------------------------
    const disambiguationNotes: string[] = [];

    // 1. Check for group clause introduced by among / with / between / across
    const groupClauseMatch = prompt.match(/(?:among|with|between|across)\s+([^.]+?)(?:\.|\s*,\s*(?:where|cuz|leo|only)|\s+only|\s+where|\s+cuz|\s+and\s+split|\s+split|\s+to|$)/i);
    if (groupClauseMatch) {
      const rawGroup = groupClauseMatch[1]
        .replace(/and\s+/gi, ",")
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n.length > 0 && !/^\d+\s*ways?$/i.test(n));

      for (const rawName of rawGroup) {
        const clean = rawName.replace(/[.,]/g, "").trim();
        if (!clean) continue;
        if (clean.toLowerCase() === "me" || clean.toLowerCase() === "i" || clean.toLowerCase() === "myself") {
          // Already have Host
          continue;
        }

        const matchedAcc = await resolveContact(clean, handlers.userId);
        const contactEmail = matchedAcc ? matchedAcc.email : clean.includes("@") ? clean : `${clean.toLowerCase().replace(/\s+/g, ".")}@personal.example.com`;
        const contactName = matchedAcc ? matchedAcc.name : clean.charAt(0).toUpperCase() + clean.slice(1);

        if (!participantsList.some((p) => p.name.toLowerCase() === contactName.toLowerCase())) {
          participantsList.push({ name: contactName, emailOrHandle: contactEmail });
        }
      }
    }

    // 2. Check for individual custom amounts or percentages: e.g. "Leo only owes 60", "Alex owes 800"
    const unequalRegex = /([A-Za-z]+)\s*(?:only\s+)?(?:owes|pays|takes|has|:|owed)?\s*(?:[₹$]|rs\.?)?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(%|dollars?|usd|inr)?/gi;
    const foundUnequal = Array.from(prompt.matchAll(unequalRegex)).filter((m) => {
      const w = m[1].toLowerCase();
      return !["i", "we", "split", "paid", "spent", "total", "last", "for", "with", "between", "the", "and", "hrs", "hours", "me", "cuz", "only"].includes(w);
    });

    for (const m of foundUnequal) {
      const pName = m[1].trim();
      const pVal = parseFloat(m[2]);
      const isPct = m[3] === "%";

      const matchedAcc = await resolveContact(pName, handlers.userId);
      const contactEmail = matchedAcc ? matchedAcc.email : `${pName.toLowerCase().replace(/\s+/g, ".")}@personal.example.com`;
      const contactName = matchedAcc ? matchedAcc.name : pName.charAt(0).toUpperCase() + pName.slice(1);

      const existing = participantsList.find((p) => p.name.toLowerCase() === contactName.toLowerCase());
      if (existing) {
        if (isPct) existing.percentage = pVal;
        else existing.customAmount = pVal;
      } else {
        participantsList.push({
          name: contactName,
          emailOrHandle: contactEmail,
          customAmount: isPct ? undefined : pVal,
          percentage: isPct ? pVal : undefined,
        });
      }
    }

    // Check "X ways" e.g. "5 ways"
    const waysMatch = prompt.match(/(\d+)\s*ways?/i);
    const targetWays = waysMatch ? parseInt(waysMatch[1], 10) : participantsList.length;

    while (participantsList.length < targetWays && participantsList.length < 10) {
      const idx = participantsList.length;
      participantsList.push({ name: `Participant ${idx}`, emailOrHandle: `participant${idx}@example.com` });
    }

    // Execute differential penny-locked split mathematics
    const diffResult = calculateDifferentialSplit(splitAmount, participantsList, splitMemo);
    const splitAllocations = diffResult.allocations;

    const nonHostAllocs = splitAllocations.filter((a) => !a.name.toLowerCase().includes("host"));

    // Prepare authentic PayPal invoices for participants (direct peer-to-peer)
    const recipients = nonHostAllocs.map((a) => ({
      email: a.emailOrHandle.includes("@") ? a.emailOrHandle : `${a.name.toLowerCase().replace(/\s+/g, ".")}@personal.example.com`,
      name: a.name,
      amount: a.amount,
      description: splitMemo,
    }));

    if (recipients.length > 0) {
      const invoiceArgs = { recipients, isConfirmed: false };
      const invoiceResult = (await executeAgentTool("dispatch_paypal_invoices", invoiceArgs)) as Record<string, unknown>;
      executedTools.push({ name: "dispatch_paypal_invoices", args: invoiceArgs, result: invoiceResult });
      handlers.onToolCall?.("dispatch_paypal_invoices", invoiceArgs, invoiceResult);
      actionCard = invoiceResult;
      handlers.onActionCard?.(actionCard);
    }

    // Persist SplitRecord & SplitItem in PostgreSQL
    if (handlers.userId && nonHostAllocs.length > 0) {
      try {
        await prisma.splitRecord.create({
          data: {
            userId: handlers.userId,
            totalAmount: splitAmount,
            status: "PENDING_CONFIRMATION",
            description: splitMemo,
            itemsJson: nonHostAllocs as unknown as Prisma.InputJsonValue,
            items: {
              create: nonHostAllocs.map((a) => ({
                participantName: a.name,
                participantEmail: a.emailOrHandle.includes("@") ? a.emailOrHandle : `${a.name.toLowerCase().replace(/\s+/g, ".")}@personal.example.com`,
                amount: a.amount,
                status: "DRAFT",
              })),
            },
          },
        });
      } catch (dbErr) {
        console.warn("[Split Record Persist Error]", dbErr);
      }
    }

    // Mutate AG Grid
    gridMutation = {
      groupBy: ["debtor_name"],
      filter: { status: "pending" },
      statusMessage: `Displaying penny-locked split for ${currencySymbol}${splitAmount.toFixed(2)} across ${participantsList.length} people.`,
    };
    handlers.onGridMutation?.(gridMutation);

    const shareDesc = splitAllocations.map((a) => {
      const emailTag = a.emailOrHandle ? ` (\`${a.emailOrHandle}\`)` : "";
      return `• **${a.name}**${emailTag}: **${currencySymbol}${a.amount.toFixed(2)}**`;
    }).join("\n");

    const noteSection = disambiguationNotes.length > 0 ? `\n\n🔍 ${disambiguationNotes.join("\n")}` : "";

    reply = `### 👥 Penny-Locked Split: **${currencySymbol}${splitAmount.toFixed(2)} ${currencyCode}**\n\nDivided across **${participantsList.length}** participants with penny-accurate math:\n\n${shareDesc}${noteSection}\n\n*Invoices are drafted and backed by your Split Ledger. Tap **Confirm & Send Invoices** on the card below to notify participants via PayPal.*`;
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

    const storeMatch = prompt.match(/(?:at|from|to)\s+([A-Za-z0-9\s&'.]+?)(?:\s+for|\s+and|\s*\$|$)/i);
    const merchantName = storeMatch ? storeMatch[1].trim() : `${categoryName} Merchant`;

    const logArgs = { category: categoryName, amount: amountToLog, merchant: merchantName, description: categoryName };
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
  else if (p.includes("receipt") || p.includes("dinner bill") || p.includes("audit") || (p.includes("check") && (p.includes("paypal charged") || p.includes("charged me")))) {
    const filterEmail = handlers.userId?.includes("@") ? handlers.userId : undefined;
    const liveTxs = await paypalClient.fetchRecentTransactions(720, filterEmail).catch(() => []);

    // Extract merchant candidate from prompt
    let merchantCandidate = "";
    const atMatch = prompt.match(/(?:at|from|for|against)\s+([A-Za-z0-9\s&'.]+?)(?:\.|\s+The|\s+the|\s+where|\s+for|\s+and|\s*$|\?)/i);
    if (atMatch && atMatch[1]) {
      merchantCandidate = atMatch[1].trim();
    } else {
      for (const tx of liveTxs) {
        if (tx.merchantName && p.includes(tx.merchantName.toLowerCase())) {
          merchantCandidate = tx.merchantName;
          break;
        }
      }
    }

    // Match candidate against live transactions
    const matchingTxs = merchantCandidate
      ? liveTxs.filter((t) => {
          const tm = t.merchantName.toLowerCase();
          const mc = merchantCandidate.toLowerCase();
          return tm.includes(mc) || mc.includes(tm) || tm.split(" ")[0] === mc.split(" ")[0];
        })
      : [];

    if (matchingTxs.length === 0) {
      reply = `I searched your live PayPal ledger, but found no record matching "**${merchantCandidate || "the specified merchant"}**". Please verify the merchant name or sync your latest PayPal transactions.`;
    } else {
      const targetTx = matchingTxs[0];
      const targetTxId = targetTx.id;
      const chargedAmount = targetTx.amount;

      // Extract numbers from prompt (e.g. food, tax, tip)
      const numbers = Array.from(prompt.matchAll(/(?:^|[^\w$.])\$?(\d+(?:\.\d{1,2})?)/g))
        .map((m) => parseFloat(m[1]))
        .filter((n) => n > 0 && n !== 168 && n !== 720);

      let receiptSum = chargedAmount;
      if (numbers.length > 0) {
        receiptSum = numbers.reduce((sum, n) => sum + n, 0);
      }

      const diff = chargedAmount - receiptSum;
      const hasDiscrepancy = Math.abs(diff) > 0.01;

      const auditArgs = {
        receiptTotal: receiptSum,
        tax: 0,
        tip: 0,
        transactionId: targetTxId,
      };
      const auditResult = (await executeAgentTool("audit_receipt_against_transaction", auditArgs)) as Record<string, unknown>;
      executedTools.push({ name: "audit_receipt_against_transaction", args: auditArgs, result: auditResult });
      handlers.onToolCall?.("audit_receipt_against_transaction", auditArgs, auditResult);

      if (hasDiscrepancy) {
        gridMutation = {
          highlightRowId: targetTxId,
          statusMessage: `Discrepancy flagged: $${receiptSum.toFixed(2)} receipt items vs. $${chargedAmount.toFixed(2)} settled PayPal charge.`,
        };
        handlers.onGridMutation?.(gridMutation);

        reply = `Hold on — the receipt items, tax, and tip sum to **$${receiptSum.toFixed(2)}**, but PayPal was charged **$${chargedAmount.toFixed(2)}** (an unlisted **$${diff.toFixed(2)}** merchant service surcharge on **${targetTx.merchantName}**).\n\nWould you like me to initiate a PayPal dispute for the $${diff.toFixed(2)} discrepancy, or split the full settled $${chargedAmount.toFixed(2)} evenly three ways?`;
      } else {
        gridMutation = {
          highlightRowId: targetTxId,
          statusMessage: `Verified: $${receiptSum.toFixed(2)} receipt items match settled PayPal charge.`,
        };
        handlers.onGridMutation?.(gridMutation);

        reply = `✅ **Audit Verified**: The receipt total of **$${receiptSum.toFixed(2)}** matches your settled PayPal charge of **$${chargedAmount.toFixed(2)}** for **${targetTx.merchantName}** perfectly. No unexpected surcharges were detected.`;
      }
    }
  }
  // 5.5. Initiate PayPal Dispute
  else if (p.includes("dispute") && !p.includes("audit") && !p.includes("receipt")) {
    const filterEmail = handlers.userId?.includes("@") ? handlers.userId : undefined;
    const liveTxs = await paypalClient.fetchRecentTransactions(720, filterEmail).catch(() => []);

    let targetTx = liveTxs.find((t) => p.includes(t.merchantName.toLowerCase()));
    if (!targetTx) {
      targetTx = liveTxs.find((t) => t.status === "DISPUTED") || liveTxs[0];
    }

    if (targetTx) {
      const amtMatch = prompt.match(/\$?(\d+(?:\.[0-9]{1,2})?)/);
      const disputeAmt = amtMatch ? parseFloat(amtMatch[1]) : (targetTx ? targetTx.amount : 0.0);

      const disputeArgs = {
        transactionId: targetTx.id,
        reason: "Unlisted merchant surcharge discrepancy",
        disputedAmount: disputeAmt,
        isConfirmed: true,
      };

      const disputeResult = (await executeAgentTool("initiate_paypal_dispute", disputeArgs)) as Record<string, unknown>;
      executedTools.push({ name: "initiate_paypal_dispute", args: disputeArgs, result: disputeResult });
      handlers.onToolCall?.("initiate_paypal_dispute", disputeArgs, disputeResult);

      gridMutation = {
        highlightRowId: targetTx.id,
        statusMessage: `PayPal dispute initiated for $${disputeAmt.toFixed(2)} against ${targetTx.merchantName}.`,
      };
      handlers.onGridMutation?.(gridMutation);

      reply = `🛡️ **PayPal Dispute Initiated**\n\n• **Merchant**: ${targetTx.merchantName}\n• **Dispute Claim**: $${disputeAmt.toFixed(2)}\n• **Reason**: Unlisted merchant service surcharge\n• **Status**: Under PayPal Sandbox Buyer Protection Review\n\nYour AG Grid ledger status has been updated.`;
    } else {
      reply = "Please specify which transaction or merchant charge you would like to dispute.";
    }
  }
  // 6. Auto-Categorize Ledger Transactions (Prioritized over generic grid view prompts)
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

    let triagePrompt = "";
    if (autoResult.uncategorizedRemaining > 0) {
      const effectiveUserId = handlers.userId || "demo_user";
      const filterEmail = effectiveUserId.includes("@") ? effectiveUserId : undefined;
      const liveTxs = await paypalClient.fetchRecentTransactions(720, filterEmail).catch(() => []);

      let existingOverrides: Array<{ transactionId: string; categoryName: string }> = [];
      try {
        existingOverrides = await prisma.transactionCategoryOverride.findMany({
          where: { userId: effectiveUserId },
          select: { transactionId: true, categoryName: true },
        });
      } catch (dbErr) {
        console.warn("[Triage DB Warning]", dbErr);
      }

      const overriddenIds = new Set(
        existingOverrides
          .filter((o) => o.categoryName.toLowerCase() !== "uncategorized")
          .map((o) => o.transactionId)
      );

      const uncategorizedTxs = liveTxs.filter((t) => !overriddenIds.has(t.id));

      if (uncategorizedTxs.length > 0) {
        const nextTx = uncategorizedTxs[0];

        const userCategories = await prisma.budgetCategory.findMany({
          where: { userId: effectiveUserId },
          select: { name: true },
          orderBy: { createdAt: "asc" },
        }).catch(() => []);

        const activeCatNames = userCategories.length > 0
          ? userCategories.map((c) => c.name)
          : ["Dining", "Groceries", "Shopping", "Entertainment", "Travel"];

        const optionsLines = activeCatNames
          .slice(0, 5)
          .map((name, i) => `• Reply **${i + 1}** for **${name}**`)
          .join("\n");

        gridMutation = {
          highlightRowId: nextTx.id,
          filter: { category: "Uncategorized" },
          statusMessage: `Step-by-Step Triage (1 of ${uncategorizedTxs.length}): Reviewing ${nextTx.merchantName} ($${nextTx.amount.toFixed(2)})`,
        };
        handlers.onGridMutation?.(gridMutation);

        const dateStr = new Date(nextTx.timestamp).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
        const memoLine = nextTx.memo && nextTx.memo.toLowerCase() !== nextTx.merchantName.toLowerCase()
          ? `• **Memo / Item:** ${nextTx.memo}\n`
          : "";

        triagePrompt = `\n\n---\n### 🔍 Step-by-Step Triage (1 of ${uncategorizedTxs.length} remaining)\n\nI've highlighted the next uncategorized item on your AG Grid ledger:\n\n• **Merchant / Payee:** **${nextTx.merchantName}**\n• **Amount:** **$${nextTx.amount.toFixed(2)} USD**\n${memoLine}• **Date:** ${dateStr}\n\n**Choose how to categorize this item:**\n${optionsLines}\n• Or reply with any custom category name!`;
      }
    }

    reply = `🧠 **AI Auto-Categorization Complete**\n\n${autoResult.message}${detailList ? `\n\n${detailList}` : ""}${triagePrompt || remainingText}`;
  }
  // 7. Interactive AG Grid Ledger Exploration
  else if (!p.includes("categor") && (p.includes("unsettled") || p.includes("debts") || p.includes("group by") || (p.includes("show") && (p.includes("ledger") || p.includes("grid"))))) {
    const groupByPerson = p.includes("person") || p.includes("debtor") || p.includes("who");
    const groupCol = groupByPerson ? ["debtor_name"] : ["category"];

    gridMutation = {
      groupBy: groupCol,
      filter: { status: "pending" },
      renderChart: groupByPerson ? "debt_by_person_bar" : "budget_burn_bar",
      statusMessage: `Interactive Ledger: Grouped by ${groupByPerson ? "debtor name" : "category"} with pending filters applied.`,
    };
    handlers.onGridMutation?.(gridMutation);

    reply = `I've reconfigured your AG Grid ledger to display unsettled items grouped by ${groupByPerson ? "debtor name" : "category"}. Would you like me to review outstanding balances or dispatch reminder invoices?`;
  }
  // 8. End-of-Day Ambiguity Triage Sweep
  else if (p.includes("sweep") || p.includes("untagged") || p.includes("eod")) {
    const effectiveUserId = handlers.userId || "demo_user";
    const filterEmail = effectiveUserId.includes("@") ? effectiveUserId : undefined;
    const liveTxs = await paypalClient.fetchRecentTransactions(720, filterEmail).catch(() => []);

    let existingOverrides: Array<{ transactionId: string; categoryName: string }> = [];
    try {
      existingOverrides = await prisma.transactionCategoryOverride.findMany({
        where: { userId: effectiveUserId },
        select: { transactionId: true, categoryName: true },
      });
    } catch (dbErr) {
      console.warn("[Sweep DB Warning]", dbErr);
    }

    const overriddenIds = new Set(
      existingOverrides
        .filter((o) => o.categoryName.toLowerCase() !== "uncategorized")
        .map((o) => o.transactionId)
    );

    const uncategorizedTxs = liveTxs.filter((t) => !overriddenIds.has(t.id));

    if (uncategorizedTxs.length > 0) {
      const topUncat = uncategorizedTxs[0];
      const dateStr = new Date(topUncat.timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
      reply = `End-of-day audit complete. I identified ${uncategorizedTxs.length} unassigned charge(s) requiring your attention:\n\n• **$${topUncat.amount.toFixed(2)}** at **'${topUncat.merchantName}'** (${dateStr})\n\nHow would you like to categorize this? You can say *"mark as Dining"*, *"mark as Travel"*, or *"split this"*!`;
    } else {
      reply = "End-of-day audit complete. All transactions in your ledger are fully categorized across your active budgets!";
    }
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
  // 8. Scheduled Item Analysis (Bills, Subscriptions, Calendar items)
  else if (
    (p.includes("scheduled") ||
      (p.includes("bill") && !p.includes("bistro")) ||
      p.includes("checkpoint") ||
      (p.includes("due") && !p.includes("debtor") && !p.includes("owed"))) &&
    !isPaymentReminderIntent
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

    if (!targetEvent && !queryTitle && userEvents.length > 0) {
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
