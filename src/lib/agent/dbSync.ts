import { prisma } from "@/lib/db";
import { PersonaType } from "./prompts";

/**
 * Persists a message to the ChatMessage table in Neon Postgres
 */
export async function persistChatMessage(
  role: "user" | "assistant" | "system",
  content: string,
  persona: PersonaType = "GENERAL",
  toolCalls?: unknown,
  userId?: string
) {
  try {
    if (!userId) return;

    await prisma.chatMessage.create({
      data: {
        userId,
        role,
        content,
        persona,
        toolCallsJson: toolCalls ? JSON.stringify(toolCalls) : undefined,
      },
    });
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
