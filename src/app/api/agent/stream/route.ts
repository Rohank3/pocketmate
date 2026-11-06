import { NextRequest } from "next/server";
import { assembleSystemPrompt, PersonaType } from "@/lib/agent/prompts";
import { agentToolDeclarations, executeAgentTool } from "@/lib/agent/tools";
import { GridMutationState } from "@/types/agent";

interface StreamMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, persona = "GENERAL" as PersonaType } = (await req.json()) as {
      messages: StreamMessage[];
      persona?: PersonaType;
    };

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid 'messages' payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECONDARY;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";

        // If no live Gemini key configured, stream through our deterministic scenario engine
        if (!apiKey || apiKey === "your-gemini-api-key") {
          await streamDeterministicSimulatedScenario(lastUserMsg, persona, sendEvent);
          controller.close();
          return;
        }

        try {
          const systemPrompt = assembleSystemPrompt(persona);
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}&alt=sse`;

          const formattedContents = messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }));

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
            generationConfig: { temperature: 0.2 },
          };

          const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
          });

          if (!geminiRes.ok || !geminiRes.body) {
            console.warn(`[Gemini SSE] HTTP ${geminiRes.status}. Falling back to deterministic stream.`);
            await streamDeterministicSimulatedScenario(lastUserMsg, persona, sendEvent);
            controller.close();
            return;
          }

          const reader = geminiRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const chunkJson = JSON.parse(line.slice(6));
                  const candidate = chunkJson.candidates?.[0];
                  const parts = candidate?.content?.parts || [];

                  for (const part of parts) {
                    if (part.text) {
                      sendEvent("text_delta", { text: part.text });
                    } else if (part.functionCall) {
                      const toolName = part.functionCall.name;
                      const toolArgs = part.functionCall.args || {};

                      sendEvent("tool_start", { name: toolName });
                      const toolResult = (await executeAgentTool(toolName, toolArgs)) as Record<string, unknown>;
                      sendEvent("tool_call", { name: toolName, args: toolArgs, result: toolResult });

                      if (toolName === "mutate_ag_grid" && toolResult.gridMutation) {
                        sendEvent("grid_mutation", toolResult.gridMutation);
                      }

                      if (toolResult.requiresConfirmation) {
                        sendEvent("action_card", toolResult);
                      }
                    }
                  }
                } catch {
                  // Partial chunk in SSE buffer; continue
                }
              }
            }
          }

          sendEvent("done", { status: "complete" });
          controller.close();
        } catch (err: unknown) {
          console.error("[Stream API Error]", err);
          await streamDeterministicSimulatedScenario(lastUserMsg, persona, sendEvent);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stream processing error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Deterministic scenario streamer with simulated pacing for realistic UI feel
 */
async function streamDeterministicSimulatedScenario(
  prompt: string,
  persona: PersonaType,
  sendEvent: (event: string, data: unknown) => void
) {
  const p = prompt.toLowerCase();

  // Helper for small pacing
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  if (p.includes("last 3 hours") || (p.includes("split") && (p.includes("alex") || p.includes("5 ways")))) {
    sendEvent("tool_start", { name: "fetch_recent_transactions" });
    await delay(120);
    const txResult = await executeAgentTool("fetch_recent_transactions", { hoursBack: 3 });
    sendEvent("tool_call", { name: "fetch_recent_transactions", args: { hoursBack: 3 }, result: txResult });

    sendEvent("tool_start", { name: "calculate_deterministic_split" });
    await delay(100);
    const splitResult = await executeAgentTool("calculate_deterministic_split", {
      totalAmount: 200.0,
      participants: [
        { name: "You (Host)", emailOrHandle: "host@example.com" },
        { name: "Alex", emailOrHandle: "alex@example.com" },
        { name: "Dave", emailOrHandle: "dave@example.com" },
        { name: "Priya", emailOrHandle: "priya@example.com" },
        { name: "Sam", emailOrHandle: "sam@example.com" },
      ],
      memo: "Bar ($65), Bowling ($85), Diner ($50)",
    });
    sendEvent("tool_call", { name: "calculate_deterministic_split", result: splitResult });

    const invoiceResult = await executeAgentTool("dispatch_paypal_invoices", {
      recipients: [
        { email: "alex@example.com", name: "Alex", amount: 40.0, description: "Bar, bowling & diner split" },
        { email: "dave@example.com", name: "Dave", amount: 40.0, description: "Bar, bowling & diner split" },
        { email: "priya@example.com", name: "Priya", amount: 40.0, description: "Bar, bowling & diner split" },
        { email: "sam@example.com", name: "Sam", amount: 40.0, description: "Bar, bowling & diner split" },
      ],
      isConfirmed: false,
    });
    sendEvent("action_card", invoiceResult);

    const gridMutation: GridMutationState = {
      groupBy: ["debtor_name"],
      filter: { status: "pending" },
      statusMessage: "Displaying pending split allocations across Alex, Dave, Priya, and Sam ($40.00 each).",
    };
    sendEvent("grid_mutation", gridMutation);

    const fullReply = "Pulled your expenses from the last 3 hours (Bar: $65, Bowling: $85, Diner: $50 = $200 total). Each person owes $40.00. I've prepared 4 PayPal invoices for Alex, Dave, Priya, and Sam.";
    for (const word of fullReply.split(" ")) {
      sendEvent("text_delta", { text: word + " " });
      await delay(25);
    }
  } else if (p.includes("mall") || (p.includes("zara") && p.includes("sarah"))) {
    const invResult = await executeAgentTool("dispatch_paypal_invoices", {
      recipients: [
        { email: "sarah@example.com", name: "Sarah", amount: 79.0, description: "Zara hoodie ($65) + Starbucks drinks ($14)" },
      ],
      isConfirmed: false,
    });
    sendEvent("action_card", invResult);

    const logResult = await executeAgentTool("log_category_expense", {
      category: "Groceries",
      amount: 82.5,
      merchant: "Target",
      description: "Groceries",
    });
    sendEvent("tool_call", { name: "log_category_expense", result: logResult });

    const gridMutation: GridMutationState = {
      filter: { category: "Groceries" },
      renderChart: "budget_burn_bar",
      statusMessage: "Groceries budget updated: $422.50 spent of $400.00 cap.",
    };
    sendEvent("grid_mutation", gridMutation);

    const reply = "Prepared a $79.00 PayPal invoice for Sarah (Zara hoodie $65 + Starbucks $14). Logged $82.50 to your Groceries budget.\n\n⚠️ Heads up: That puts you at $422.50, which is $22.50 over your $400.00 monthly food ceiling!";
    for (const word of reply.split(" ")) {
      sendEvent("text_delta", { text: word + " " });
      await delay(25);
    }
  } else if (p.includes("receipt") || p.includes("dinner bill") || p.includes("mark and leo") || p.includes("dispute")) {
    const auditResult = await executeAgentTool("audit_receipt_against_transaction", {
      receiptTotal: 100.0,
      tax: 5.0,
      tip: 10.0,
      transactionId: "tx_dining_07",
    });
    sendEvent("tool_call", { name: "audit_receipt_against_transaction", result: auditResult });

    sendEvent("grid_mutation", {
      highlightRowId: "tx_dining_07",
      statusMessage: "Discrepancy flagged: $115 receipt vs. $130 PayPal capture.",
    });

    const reply = "Hold on — the receipt items, tax, and tip total $115.00, but PayPal was charged $130.00 (looks like an unlisted $15.00 merchant service surcharge). Would you like me to initiate a PayPal dispute for the $15.00 difference, or split the full $130.00 three ways ($43.33 each) with Mark and Leo?";
    for (const word of reply.split(" ")) {
      sendEvent("text_delta", { text: word + " " });
      await delay(25);
    }
  } else if (p.includes("unsettled") || p.includes("debts") || p.includes("weekend")) {
    sendEvent("grid_mutation", {
      groupBy: ["debtor_name"],
      filter: { status: "unpaid", type: "split" },
      renderChart: "debt_by_person_bar",
      statusMessage: "Grouping unsettled weekend splits by debtor name.",
    });

    const reply = "I've reconfigured the dashboard for you. You currently have $145.00 in pending splits across 3 people — Dave owes the largest share at $65.00.";
    for (const word of reply.split(" ")) {
      sendEvent("text_delta", { text: word + " " });
      await delay(25);
    }
  } else {
    const reply = `PocketMate active in ${persona} mode. How can I assist with your expenses or PayPal transactions?`;
    for (const word of reply.split(" ")) {
      sendEvent("text_delta", { text: word + " " });
      await delay(25);
    }
  }

  sendEvent("done", { status: "complete" });
}
