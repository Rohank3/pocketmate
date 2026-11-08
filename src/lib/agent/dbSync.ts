import { prisma } from "@/lib/db";
import { PersonaType } from "./prompts";

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
) {
  try {
    if (!userId) return;

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

    await prisma.chatMessage.create({
      data: {
        userId,
        threadId: targetThreadId,
        role,
        content,
        persona,
        toolCallsJson: toolCalls ? JSON.stringify(toolCalls) : undefined,
      },
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
  } catch (err) {
    console.warn("[Persist Chat DB Warning]", err);
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
