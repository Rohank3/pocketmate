import { NextRequest } from "next/server";
import { assembleSystemPrompt, PersonaType } from "@/lib/agent/prompts";
import { agentToolDeclarations, executeAgentTool } from "@/lib/agent/tools";
import { persistChatMessage } from "@/lib/agent/dbSync";
import { handleDynamicAutonomousResponse } from "@/lib/agent/orchestrator";

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
        if (lastUserMsg) {
          persistChatMessage("user", lastUserMsg, persona);
        }

        // Helper to stream through dynamic autonomous engine with pacing
        const runDynamicFallback = async () => {
          const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          await handleDynamicAutonomousResponse(lastUserMsg, persona, {
            onTextDelta: async (text: string) => {
              for (const word of text.split(" ")) {
                sendEvent("text_delta", { text: word + " " });
                await delay(20);
              }
            },
            onToolCall: (name, args, result) => {
              sendEvent("tool_start", { name });
              sendEvent("tool_call", { name, args, result });
            },
            onGridMutation: (mutation) => {
              sendEvent("grid_mutation", mutation);
            },
            onActionCard: (card) => {
              sendEvent("action_card", card);
            },
            onPersonaUpdate: (newPersona) => {
              sendEvent("persona_update", { persona: newPersona });
            },
          });
          sendEvent("done", { status: "complete" });
        };

        // If no Gemini key configured or is placeholder, run through dynamic autonomous engine
        if (!apiKey || apiKey === "your-gemini-api-key") {
          await runDynamicFallback();
          controller.close();
          return;
        }

        try {
          const systemPrompt = assembleSystemPrompt(persona);
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?key=${apiKey}&alt=sse`;

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

          // 8-second timeout for streaming connection
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 8000);

          const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
            signal: abortController.signal,
          }).finally(() => clearTimeout(timeoutId));

          if (!geminiRes.ok || !geminiRes.body) {
            console.warn(`[Gemini SSE] HTTP ${geminiRes.status}. Falling back to dynamic autonomous engine.`);
            await runDynamicFallback();
            controller.close();
            return;
          }

          const reader = geminiRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let hasGeneratedText = false;
          const liveExecutedTools: Array<{ name: string; result: Record<string, unknown> }> = [];

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
                      hasGeneratedText = true;
                      sendEvent("text_delta", { text: part.text });
                    } else if (part.functionCall) {
                      const toolName = part.functionCall.name;
                      const toolArgs = part.functionCall.args || {};

                      sendEvent("tool_start", { name: toolName });
                      const toolResult = (await executeAgentTool(toolName, toolArgs)) as Record<string, unknown>;
                      liveExecutedTools.push({ name: toolName, result: toolResult });
                      sendEvent("tool_call", { name: toolName, args: toolArgs, result: toolResult });

                      if (toolName === "mutate_ag_grid" && toolResult.gridMutation) {
                        sendEvent("grid_mutation", toolResult.gridMutation);
                      }

                      if (toolName === "update_user_persona" && toolResult.activePersona) {
                        sendEvent("persona_update", { persona: toolResult.activePersona });
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

          // If Gemini called tools without emitting final text, synthesize summary
          if (!hasGeneratedText && liveExecutedTools.length > 0) {
            const summaryParts: string[] = [];
            for (const t of liveExecutedTools) {
              if (t.name === "calculate_deterministic_split" && t.result.totalAmount) {
                summaryParts.push(`Calculated split of $${t.result.totalAmount} with exact penny conservation.`);
              } else if (t.name === "dispatch_paypal_invoices" && t.result.requiresConfirmation) {
                summaryParts.push(`Prepared ${t.result.totalRecipients} PayPal invoices totaling $${t.result.totalAmount}. Review the card below and confirm dispatch.`);
              } else if (t.name === "log_category_expense") {
                summaryParts.push(`Logged $${t.result.amountLogged} to ${t.result.category}. ${(t.result.alert as string) || ""}`);
              }
            }
            const fallbackSummary = summaryParts.join(" ") || "Tools executed successfully.";
            sendEvent("text_delta", { text: fallbackSummary });
          }

          sendEvent("done", { status: "complete" });
          controller.close();
        } catch (err: unknown) {
          console.warn("[Stream API Fallback]", err);
          await runDynamicFallback();
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
