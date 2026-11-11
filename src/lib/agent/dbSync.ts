import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PersonaType } from "./prompts";

export interface ActionCardResolutionPatch {
  resolvedStatus: string;
  resolvedAction?: string;
  resolvedMessage?: string;
  resolvedCategory?: string;
  resolvedReason?: string;
  resolvedAt?: string;
}

export function parseToolCallsRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore invalid JSON
  }
  return null;
}

/**
 * Stamps resolution metadata onto matching assistant `ChatMessage.toolCallsJson.actionCard` records
 * so interactive chat cards never revert to active action buttons after reloads or redirects.
 */
export async function markChatActionCardsResolved(params: {
  userId: string;
  messageId?: string;
  match?: (card: Record<string, unknown>, createdAt: Date) => boolean;
  resolution: ActionCardResolutionPatch;
}): Promise<void> {
  try {
    if (!params.userId) return;

    const cleanMessageId =
      params.messageId && !params.messageId.startsWith("asst_") && !params.messageId.startsWith("err_")
        ? params.messageId
        : undefined;

    const candidates = await prisma.chatMessage.findMany({
      where: {
        userId: params.userId,
        role: "assistant",
        ...(cleanMessageId ? { id: cleanMessageId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: cleanMessageId ? 1 : 60,
      select: {
        id: true,
        toolCallsJson: true,
        createdAt: true,
      },
    });

    const resolvedTimestamp = params.resolution.resolvedAt || new Date().toISOString();

    for (const msg of candidates) {
      const toolCalls = parseToolCallsRecord(msg.toolCallsJson);
      if (!toolCalls) continue;

      const rawCard =
        toolCalls.actionCard && typeof toolCalls.actionCard === "object"
          ? (toolCalls.actionCard as Record<string, unknown>)
          : typeof toolCalls.action === "string"
          ? toolCalls
          : null;

      if (!rawCard) continue;

      const isTarget = cleanMessageId
        ? msg.id === cleanMessageId
        : params.match
        ? params.match(rawCard, msg.createdAt)
        : false;

      if (!isTarget) continue;

      const updatedCard: Record<string, unknown> = {
        ...rawCard,
        resolvedStatus: params.resolution.resolvedStatus,
        resolvedAt: resolvedTimestamp,
        ...(params.resolution.resolvedAction !== undefined
          ? { resolvedAction: params.resolution.resolvedAction }
          : {}),
        ...(params.resolution.resolvedMessage !== undefined
          ? { resolvedMessage: params.resolution.resolvedMessage }
          : {}),
        ...(params.resolution.resolvedCategory !== undefined
          ? { resolvedCategory: params.resolution.resolvedCategory }
          : {}),
        ...(params.resolution.resolvedReason !== undefined
          ? { resolvedReason: params.resolution.resolvedReason }
          : {}),
      };

      const nextToolCalls: Record<string, unknown> =
        toolCalls.actionCard && typeof toolCalls.actionCard === "object"
          ? { ...toolCalls, actionCard: updatedCard }
          : { actionCard: updatedCard };

      const serialized =
        typeof msg.toolCallsJson === "string"
          ? JSON.stringify(nextToolCalls)
          : (nextToolCalls as unknown as Prisma.InputJsonValue);

      await prisma.chatMessage.update({
        where: { id: msg.id },
        data: {
          toolCallsJson: serialized,
        },
      });
    }
  } catch (err) {
    console.warn("[Mark Chat ActionCard Resolved Warning]", err);
  }
}

/**
 * Persists a message to the ChatMessage table in Neon Postgres with thread association and FIFO pruning.
 */
export async function persistChatMessage(
  role: "user" | "assistant" | "system",
  content: string,
  persona: PersonaType = "GENERAL",
  toolCalls?: unknown,
  userId?: string,
  threadId?: string
): Promise<string | undefined> {
  try {
    if (!userId) return undefined;

    let targetThreadId = threadId;
    if (targetThreadId) {
      const existingThread = await prisma.chatThread.findFirst({
        where: { id: targetThreadId, userId },
      });
      if (!existingThread) {
        targetThreadId = undefined;
      }
    }

    if (!targetThreadId) {
      let defaultThread = await prisma.chatThread.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
      if (!defaultThread) {
        defaultThread = await prisma.chatThread.create({
          data: {
            userId,
            title: "New Conversation",
          },
        });
      }
      targetThreadId = defaultThread.id;
    }

    const created = await prisma.chatMessage.create({
      data: {
        userId,
        threadId: targetThreadId,
        role,
        content,
        persona,
        toolCallsJson: toolCalls ? JSON.stringify(toolCalls) : undefined,
      },
      select: { id: true },
    });

    await prisma.chatThread.update({
      where: { id: targetThreadId },
      data: { updatedAt: new Date() },
    });

    // Enforce 30-message retention cap FIFO per thread
    const count = await prisma.chatMessage.count({
      where: { threadId: targetThreadId },
    });
    if (count > 30) {
      const excess = count - 30;
      const oldest = await prisma.chatMessage.findMany({
        where: { threadId: targetThreadId },
        take: excess,
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      await prisma.chatMessage.deleteMany({
        where: { id: { in: oldest.map((o) => o.id) } },
      });
    }

    return created.id;
  } catch (err) {
    console.warn("[Persist Chat DB Warning]", err);
    return undefined;
  }
}

/**
 * Syncs an expense to the live BudgetCategory and creates a BudgetEntry
 */
export async function syncBudgetExpenseToDB(
  categoryName: string,
  amount: number,
  merchant?: string,
  description?: string,
  userId?: string
) {
  try {
    if (!userId) return;

    let category = await prisma.budgetCategory.findFirst({
      where: {
        userId,
        name: { equals: categoryName, mode: "insensitive" },
      },
    });

    if (!category) {
      category = await prisma.budgetCategory.create({
        data: {
          userId,
          name: categoryName,
          monthlyCap: 350.0,
          currentSpent: 0,
        },
      });
    }

    await prisma.budgetCategory.update({
      where: { id: category.id },
      data: {
        currentSpent: category.currentSpent + amount,
      },
    });

    await prisma.budgetEntry.create({
      data: {
        categoryId: category.id,
        amount,
        merchant: merchant || "Card Transaction",
        description: description || `Logged to ${categoryName}`,
      },
    });
  } catch (err) {
    console.warn("[Sync Budget DB Warning]", err);
  }
}
