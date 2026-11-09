import { NextRequest } from "next/server";
import { assembleSystemPrompt } from "@/lib/agent/prompts";
import { agentToolDeclarations, executeAgentTool } from "@/lib/agent/tools";
import { persistChatMessage } from "@/lib/agent/dbSync";
import { handleDynamicAutonomousResponse } from "@/lib/agent/orchestrator";
import { getUserIdFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { z } from "zod";

const StreamRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(10000),
      })
    )
    .min(1)
    .max(50),
  persona: z.enum(["GENERAL", "FREELANCER", "BUSINESS"]).default("GENERAL"),
  threadId: z.string().optional(),
});

function generateSmartThreadTitle(prompt: string): string {
  const clean = prompt
    .replace(/^(can you|could you|please|help me|i want to|i need to)\s+/i, "")
    .replace(/[^\w\s$-]/g, " ")
    .trim();
  const words = clean.split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length === 0) return "Conversation";
  const title = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return title.slice(0, 40) || "Conversation";
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    // Sanitize message stream input: filter out empty messages and trim content
    if (rawBody?.messages && Array.isArray(rawBody.messages)) {
      rawBody.messages = rawBody.messages
        .filter((m: { content?: string }) => typeof m?.content === "string" && m.content.trim().length > 0)
        .map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content.trim(),
        }));
      if (rawBody.messages.length === 0) {
        rawBody.messages = [{ role: "user", content: "Hello" }];
      }
    }

    const parseResult = StreamRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: parseResult.error.issues.map((i) => i.message).join(", "),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { messages, persona, threadId } = parseResult.data;
    const rawUserId = await getUserIdFromRequest(req);
    const userId = rawUserId ?? undefined;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_SECONDARY;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;
        const sendEvent = (event: string, data: unknown) => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            isClosed = true;
          }
        };

        const safeClose = () => {
          if (isClosed) return;
          isClosed = true;
          try {
            controller.close();
          } catch {
            // Already closed
          }
        };

        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
        let activeThreadId = threadId;

        // Auto-title thread if it's default or new
        if (userId && lastUserMsg) {
          if (!activeThreadId) {
            try {
              const newThread = await prisma.chatThread.create({
                data: {
                  userId,
                  title: generateSmartThreadTitle(lastUserMsg),
                },
              });
              activeThreadId = newThread.id;
              sendEvent("thread_created", { thread: newThread });
            } catch (err) {
              console.warn("[Auto-Create Thread Error]", err);
            }
          } else {
            try {
              const currentThread = await prisma.chatThread.findFirst({
                where: { id: activeThreadId, userId },
              });
              if (currentThread && (currentThread.title === "New Conversation" || !currentThread.title)) {
                const smartTitle = generateSmartThreadTitle(lastUserMsg);
                await prisma.chatThread.update({
                  where: { id: activeThreadId },
                  data: { title: smartTitle },
                });
                sendEvent("thread_renamed", { id: activeThreadId, title: smartTitle });
              }
            } catch (err) {
              console.warn("[Auto-Title Thread Error]", err);
            }
          }
        }

        if (lastUserMsg) {
          persistChatMessage("user", lastUserMsg, persona, undefined, userId, activeThreadId);
        }

        let fallbackAccumulatedText = "";
        let fallbackActionCard: Record<string, unknown> | null = null;
        const fallbackBadges: string[] = [];

        // Helper to stream through dynamic autonomous engine with pacing
        const runDynamicFallback = async () => {
          const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          const dynResult = await handleDynamicAutonomousResponse(lastUserMsg, persona, {
            userId,
            onTextDelta: async (text: string) => {
              fallbackAccumulatedText += text;
              for (const word of text.split(" ")) {
                if (isClosed) break;
                sendEvent("text_delta", { text: word + " " });
                await delay(15);
              }
            },
            onToolCall: (name, args, result) => {
              fallbackBadges.push(name);
              sendEvent("tool_start", { name });
              sendEvent("tool_call", { name, args, result });
            },
            onGridMutation: (mutation) => {
              sendEvent("grid_mutation", mutation);
            },
            onActionCard: (card) => {
              fallbackActionCard = card;
              sendEvent("action_card", card);
            },
            onPersonaUpdate: (newPersona) => {
              sendEvent("persona_update", { persona: newPersona });
            },
          });

          const finalText = fallbackAccumulatedText || dynResult?.reply || "Response completed.";
          const finalCard = fallbackActionCard || dynResult?.actionCard || undefined;

          persistChatMessage(
            "assistant",
            finalText,
            persona,
            { actionCard: finalCard, toolBadges: fallbackBadges },
            userId,
            activeThreadId
          );

          sendEvent("done", { status: "complete", threadId: activeThreadId });
        };

        // If no Gemini key configured or is placeholder, run through dynamic autonomous engine
        if (!apiKey || apiKey === "your-gemini-api-key") {
          await runDynamicFallback();
          safeClose();
          return;
        }

        try {
          const systemPrompt = assembleSystemPrompt(persona);
          const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";

          const formattedContents: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }> = [];
          for (const m of messages) {
            const role = m.role === "assistant" ? "model" : "user";
            if (formattedContents.length === 0 && role === "model") {
              continue;
            }
            if (
              formattedContents.length > 0 &&
              formattedContents[formattedContents.length - 1].role === role
            ) {
              const prev = formattedContents[formattedContents.length - 1].parts[0] as { text?: string };
              if (prev.text !== undefined) {
                prev.text += `\n${m.content}`;
              }
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

          const contentsHistory: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }> = [
            ...formattedContents,
          ];

          let hasGeneratedText = false;
          let geminiAccumulatedText = "";
          let geminiLastActionCard: Record<string, unknown> | null = null;
          const geminiBadges: string[] = [];
          const liveExecutedTools: Array<{ name: string; result: Record<string, unknown> }> = [];

          let activeModel = primaryModel;
          let turnCount = 0;
          const MAX_TURNS = 3;

          while (turnCount < MAX_TURNS) {
            turnCount++;

            const bodyPayload = {
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: contentsHistory,
              tools: toolsPayload,
              generationConfig: { temperature: 0.2 },
            };

            let geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:streamGenerateContent?key=${apiKey}&alt=sse`;

            const abortController = new AbortController();
            const timeoutId = setTimeout(() => abortController.abort(), 10000);

            let geminiRes: Response;
            try {
              geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
                signal: abortController.signal,
              }).finally(() => clearTimeout(timeoutId));
            } catch (fetchErr) {
              console.warn(`[Gemini SSE] Fetch error on model ${activeModel}:`, fetchErr);
              activeModel = "gemini-3.1-flash-lite";
              geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:streamGenerateContent?key=${apiKey}&alt=sse`;
              geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
              });
            }

            if (!geminiRes.ok && (geminiRes.status === 429 || geminiRes.status === 503 || geminiRes.status === 404)) {
              activeModel = "gemini-3.1-flash-lite";
              geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:streamGenerateContent?key=${apiKey}&alt=sse`;
              geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
              });
            }

            if (!geminiRes.ok || !geminiRes.body) {
              if (turnCount === 1) {
                console.warn(`[Gemini SSE] HTTP ${geminiRes.status}. Falling back to dynamic autonomous engine.`);
                await runDynamicFallback();
                safeClose();
                return;
              } else {
                break;
              }
            }

            const reader = geminiRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            const currentTurnFunctionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string; thoughtSignature?: string }> = [];
            const currentTurnFunctionResponses: Array<{ name: string; response: Record<string, unknown> }> = [];

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
                        geminiAccumulatedText += part.text;
                        sendEvent("text_delta", { text: part.text });
                      } else if (part.functionCall) {
                        const toolName = part.functionCall.name;
                        const toolArgs = (part.functionCall.args || {}) as Record<string, unknown>;
                        const toolCallId = part.functionCall.id as string | undefined;
                        const thoughtSig = (part.thoughtSignature || part.thought_signature) as string | undefined;

                        currentTurnFunctionCalls.push({
                          name: toolName,
                          args: toolArgs,
                          id: toolCallId,
                          thoughtSignature: thoughtSig,
                        });
                        geminiBadges.push(toolName);
                        sendEvent("tool_start", { name: toolName });
                        const toolResult = (await executeAgentTool(toolName, toolArgs, userId)) as Record<string, unknown>;
                        liveExecutedTools.push({ name: toolName, result: toolResult });
                        currentTurnFunctionResponses.push({ name: toolName, response: toolResult });
                        sendEvent("tool_call", { name: toolName, args: toolArgs, result: toolResult });

                        if (toolName === "mutate_ag_grid" && toolResult.gridMutation) {
                          sendEvent("grid_mutation", toolResult.gridMutation);
                        }

                        if (toolName === "update_user_persona" && toolResult.activePersona) {
                          sendEvent("persona_update", { persona: toolResult.activePersona });
                        }

                        if (toolResult.requiresConfirmation) {
                          geminiLastActionCard = toolResult;
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

            // If Gemini invoked tools during this turn, feed the execution results back for conversational continuation
            if (currentTurnFunctionCalls.length > 0) {
              contentsHistory.push({
                role: "model",
                parts: currentTurnFunctionCalls.map((fc) => ({
                  functionCall: {
                    name: fc.name,
                    args: fc.args,
                    ...(fc.id ? { id: fc.id } : {}),
                  },
                  ...(fc.thoughtSignature ? { thoughtSignature: fc.thoughtSignature } : {}),
                })),
              });

              contentsHistory.push({
                role: "user",
                parts: currentTurnFunctionResponses.map((fr) => ({
                  functionResponse: {
                    name: fr.name,
                    response: fr.response,
                  },
                })),
              });
            } else {
              // Model finished without additional tool calls
              break;
            }
          }

          // If Gemini called tools without emitting final conversational text, run dynamic autonomous engine
          if (!hasGeneratedText) {
            await runDynamicFallback();
            safeClose();
            return;
          }

          const finalAssistantMsg = geminiAccumulatedText || "Response completed.";
          persistChatMessage(
            "assistant",
            finalAssistantMsg,
            persona,
            { actionCard: geminiLastActionCard || undefined, toolBadges: geminiBadges },
            userId,
            activeThreadId
          );

          sendEvent("done", { status: "complete", threadId: activeThreadId });
          safeClose();
        } catch (err: unknown) {
          console.warn("[Stream API Fallback]", err);
          await runDynamicFallback();
          safeClose();
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
