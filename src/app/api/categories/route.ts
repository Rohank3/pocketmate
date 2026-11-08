import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { z } from "zod";

const CreateCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(50, "Name must be 50 characters or less"),
  monthlyCap: z.number().finite().nonnegative("Monthly cap must be non-negative").max(1000000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color code").default("#3b82f6"),
});

const UpdateCategorySchema = z.object({
  id: z.string().trim().min(1, "Category ID is required").max(100),
  monthlyCap: z.number().finite().nonnegative().max(1000000).optional(),
  name: z.string().trim().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ success: true, categories: [] });
    }
    let categories = await prisma.budgetCategory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (categories.length === 0) {
      await prisma.budgetCategory.createMany({
        data: [
          { userId, name: "Groceries", monthlyCap: 400.0, currentSpent: 0.0, color: "#10b981" },
          { userId, name: "Dining", monthlyCap: 250.0, currentSpent: 0.0, color: "#3b82f6" },
          { userId, name: "Shopping", monthlyCap: 300.0, currentSpent: 0.0, color: "#ec4899" },
          { userId, name: "Entertainment", monthlyCap: 200.0, currentSpent: 0.0, color: "#8b5cf6" },
        ],
      });
      categories = await prisma.budgetCategory.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
    }

    return NextResponse.json({ success: true, categories });
  } catch (error) {
    console.error("[Categories GET Error]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser && process.env.PAYPAL_ENVIRONMENT === "live") {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const rawBody = await req.json();
    const parseResult = CreateCategorySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { name, monthlyCap, color } = parseResult.data;

    const created = await prisma.budgetCategory.upsert({
      where: {
        userId_name: {
          userId,
          name,
        },
      },
      update: {
        monthlyCap,
        color,
      },
      create: {
        userId,
        name,
        monthlyCap,
        color,
        currentSpent: 0,
      },
    });

    return NextResponse.json({ success: true, category: created });
  } catch (error) {
    console.error("[Categories POST Error]", error);
    return NextResponse.json({ success: false, error: "Failed to create category" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser && process.env.PAYPAL_ENVIRONMENT === "live") {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const rawBody = await req.json();
    const parseResult = UpdateCategorySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { id, monthlyCap, name, color } = parseResult.data;

    const existing = await prisma.budgetCategory.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found or access denied" }, { status: 404 });
    }

    const newName = name && name.trim() ? name.trim() : undefined;
    if (newName && newName.toLowerCase() !== existing.name.toLowerCase()) {
      await Promise.all([
        prisma.merchantCategoryRule.updateMany({
          where: { userId, categoryName: existing.name },
          data: { categoryName: newName },
        }),
        prisma.transactionCategoryOverride.updateMany({
          where: { userId, categoryName: existing.name },
          data: { categoryName: newName },
        }),
      ]);
    }

    const updated = await prisma.budgetCategory.update({
      where: { id },
      data: {
        ...(monthlyCap !== undefined ? { monthlyCap } : {}),
        ...(newName !== undefined ? { name: newName } : {}),
        ...(color !== undefined ? { color } : {}),
      },
    });

    return NextResponse.json({ success: true, category: updated });
  } catch (error) {
    console.error("[Categories PATCH Error]", error);
    return NextResponse.json({ success: false, error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser && process.env.PAYPAL_ENVIRONMENT === "live") {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Valid Category ID is required" }, { status: 400 });
    }

    const existing = await prisma.budgetCategory.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found or access denied" }, { status: 404 });
    }

    // Invalidate learned merchant rules and reset overrides associated with this deleted category
    await Promise.all([
      prisma.merchantCategoryRule.deleteMany({
        where: { userId, categoryName: existing.name },
      }),
      prisma.transactionCategoryOverride.updateMany({
        where: { userId, categoryName: existing.name },
        data: { categoryName: "Uncategorized" },
      }),
    ]);

    await prisma.budgetCategory.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Category deleted and associated rules invalidated" });
  } catch (error) {
    console.error("[Categories DELETE Error]", error);
    return NextResponse.json({ success: false, error: "Failed to delete category" }, { status: 500 });
  }
}
