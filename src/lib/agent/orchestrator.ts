import { assembleSystemPrompt, PersonaType } from "./prompts";
import { agentToolDeclarations, executeAgentTool } from "./tools";
import { GridMutationState, ToolExecutionRecord, AgentRunResult } from "@/types/agent";
import { callGeminiApi, getGeminiApiKeys } from "./geminiClient";

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
  thoughtSignature?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
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

  const apiKeys = getGeminiApiKeys();
  if (apiKeys.length === 0) {
    const errorMsg = "Gemini API key is required. Please add GEMINI_API_KEY to your .env.local file to use PocketMate.";
    onTextDelta?.(errorMsg);
    return {
      reply: errorMsg,
      gridMutation: null,
      actionCard: null,
      executedTools: [],
      activePersona: persona,
    };
  }

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";

  try {
    const systemPrompt = assembleSystemPrompt(persona);

    const formattedContents: Array<{
      role: "user" | "model";
      parts: Array<Record<string, unknown>>;
    }> = [];

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
        if (prev && typeof prev.text === "string") {
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

    const contentsHistory: Array<{
      role: "user" | "model";
      parts: Array<Record<string, unknown>>;
    }> = [...formattedContents];

    let finalReply = "";
    let gridMutation: GridMutationState | null = null;
    let actionCard: Record<string, unknown> | null = null;
    let activePersonaResult = persona;
    const executedTools: ToolExecutionRecord[] = [];

    let turnCount = 0;
    const MAX_TURNS = 4;

    while (turnCount < MAX_TURNS) {
      turnCount++;

      const res = await callGeminiApi({
        contents: contentsHistory,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: toolsPayload,
        generationConfig: { temperature: 0.2 },
        timeoutMs: 12000,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Gemini Orchestrator Error: ${res.status}]`, errText);
        const errMsg = `Gemini API returned status ${res.status}. Please check your quota or connection.`;
        if (!finalReply) {
          finalReply = errMsg;
          onTextDelta?.(errMsg);
        }
        break;
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const parts: GeminiCandidatePart[] = candidate?.content?.parts || [];

      const currentTurnFunctionCalls: Array<{
        name: string;
        args: Record<string, unknown>;
        id?: string;
      }> = [];
      const currentTurnFunctionResponses: Array<{
        name: string;
        response: Record<string, unknown>;
      }> = [];

      for (const part of parts) {
        if (part.text) {
          finalReply += part.text;
          onTextDelta?.(part.text);
        } else if (part.functionCall) {
          const toolName = part.functionCall.name;
          const toolArgs = part.functionCall.args || {};
          const toolCallId = part.functionCall.id;

          currentTurnFunctionCalls.push({
            name: toolName,
            args: toolArgs,
            id: toolCallId,
          });

          const toolResult = (await executeAgentTool(toolName, toolArgs, userId)) as Record<string, unknown>;
          executedTools.push({ name: toolName, args: toolArgs, result: toolResult });
          onToolCall?.(toolName, toolArgs, toolResult);

          currentTurnFunctionResponses.push({
            name: toolName,
            response: { content: toolResult },
          });

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

      // If Gemini called tools this turn, feed the execution results back preserving candidate parts
      if (currentTurnFunctionCalls.length > 0) {
        // Crucial: preserve model parts as returned by Gemini (contains thoughtSignature)
        contentsHistory.push({
          role: "model",
          parts: parts as unknown as Array<Record<string, unknown>>,
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
        // No further tool calls: turn complete
        break;
      }
    }

    return {
      reply: finalReply || "Processed your financial request successfully.",
      gridMutation,
      actionCard,
      executedTools,
      activePersona: activePersonaResult,
    };
  } catch (error) {
    console.error("[Gemini Orchestrator Exception]", error);
    const errMessage = error instanceof Error ? error.message : "Temporary financial orchestration error.";
    return {
      reply: `Encountered an issue processing your request: ${errMessage}. Please try again.`,
      gridMutation: null,
      actionCard: null,
      executedTools: [],
      activePersona: persona,
    };
  }
}
