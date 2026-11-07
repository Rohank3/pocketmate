import { prisma } from "@/lib/db";
import { PersonaType } from "./prompts";

/**
 * Ensures a default demo user exists in the Neon database
 */
export async function getOrCreateDefaultUser() {
  try {
    const user = await prisma.user.upsert({
      where: { email: "demo@pocketmate.ai" },
      update: {},
      create: {
        email: "demo@pocketmate.ai",
        name: "PocketMate User",
        persona: "GENERAL",
      },
    });

    // Ensure default budget categories exist
    const count = await prisma.budgetCategory.count({ where: { userId: user.id } });
    if (count === 0) {
      await prisma.budgetCategory.createMany({
        data: [
          { userId: user.id, name: "Groceries", monthlyCap: 400.0, currentSpent: 340.0, color: "#10b981" },
          { userId: user.id, name: "Dining", monthlyCap: 250.0, currentSpent: 180.0, color: "#3b82f6" },
          { userId: user.id, name: "Shopping", monthlyCap: 300.0, currentSpent: 120.0, color: "#a855f7" },
          { userId: user.id, name: "Entertainment", monthlyCap: 200.0, currentSpent: 85.0, color: "#6366f1" },
        ],
      });
    }

    return user;
  } catch (error) {
    console.warn("[DB Sync Warning] Database connection not active; proceeding in memory mode.", error);
    return null;
  }
}

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
    let targetUserId = userId;
    if (!targetUserId) {
      const user = await getOrCreateDefaultUser();
      targetUserId = user?.id;
    }
    if (!targetUserId) return;

    await prisma.chatMessage.create({
      data: {
        userId: targetUserId,
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
    let targetUserId = userId;
    if (!targetUserId) {
      const user = await getOrCreateDefaultUser();
      targetUserId = user?.id;
    }
    if (!targetUserId) return;

    let category = await prisma.budgetCategory.findFirst({
      where: {
        userId: targetUserId,
        name: { equals: categoryName, mode: "insensitive" },
      },
    });

    if (!category) {
      category = await prisma.budgetCategory.create({
        data: {
          userId: targetUserId,
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
