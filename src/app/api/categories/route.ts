import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { reinitializeCategory } from "@/lib/services/categorizer";
import { getDistinctColorForCategory, ensureUniqueCategoryColors } from "@/lib/utils/categoryColors";
import { z } from "zod";

const CreateCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(50, "Name must be 50 characters or less"),
  monthlyCap: z.number().finite().nonnegative("Monthly cap must be non-negative").max(1000000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color code").default("#3b82f6"),
  alertThreshold: z.number().min(0.01).max(1.0).default(0.80).optional(),
  softCap: z.number().nonnegative().max(1000000).optional(),
});

const UpdateCategorySchema = z.object({
  id: z.string().trim().min(1, "Category ID is required").max(100),
  monthlyCap: z.number().finite().nonnegative().max(1000000).optional(),
  name: z.string().trim().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  alertThreshold: z.number().min(0.01).max(1.0).optional(),
  softCap: z.number().nonnegative().max(1000000).optional(),
  reinitialize: z.boolean().default(false).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized: Active PayPal session required." }, { status: 401 });
    }
    const userId = authUser.id;
    let categories = await prisma.budgetCategory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (categories.length === 0) {
      await prisma.budgetCategory.createMany({
        data: [
          { userId, name: "Groceries", monthlyCap: 400.0, currentSpent: 0.0, color: "#10b981", alertThreshold: 0.80, softCap: 320.0 },
          { userId, name: "Dining", monthlyCap: 250.0, currentSpent: 0.0, color: "#3b82f6", alertThreshold: 0.80, softCap: 200.0 },
          { userId, name: "Shopping", monthlyCap: 300.0, currentSpent: 0.0, color: "#ec4899", alertThreshold: 0.80, softCap: 240.0 },
          { userId, name: "Entertainment", monthlyCap: 200.0, currentSpent: 0.0, color: "#8b5cf6", alertThreshold: 0.80, softCap: 160.0 },
          { userId, name: "Travel", monthlyCap: 600.0, currentSpent: 0.0, color: "#f59e0b", alertThreshold: 0.80, softCap: 480.0 },
        ],
      });
      categories = await prisma.budgetCategory.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
    }

    return NextResponse.json({ success: true, categories: ensureUniqueCategoryColors(categories) });
  } catch (error) {
    console.error("[Categories GET Error]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized: Active PayPal session required." }, { status: 401 });
    }
    const userId = authUser.id;
    const rawBody = await req.json();
    const parseResult = CreateCategorySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { name, monthlyCap, color, alertThreshold, softCap } = parseResult.data;
    const computedSoftCap = softCap ?? (monthlyCap * (alertThreshold ?? 0.80));
    const resolvedColor = color && color !== "#3b82f6" ? color : getDistinctColorForCategory(name);

    const created = await prisma.budgetCategory.upsert({
      where: {
        userId_name: {
          userId,
          name,
        },
      },
      update: {
        monthlyCap,
        color: resolvedColor,
        ...(alertThreshold !== undefined ? { alertThreshold } : {}),
        softCap: computedSoftCap,
      },
      create: {
        userId,
        name,
        monthlyCap,
        color: resolvedColor,
        currentSpent: 0,
        alertThreshold: alertThreshold ?? 0.80,
        softCap: computedSoftCap,
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
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized: Active PayPal session required." }, { status: 401 });
    }
    const userId = authUser.id;
    const rawBody = await req.json();
    const parseResult = UpdateCategorySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { id, monthlyCap, name, color, alertThreshold, softCap, reinitialize } = parseResult.data;

    const existing = await prisma.budgetCategory.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found or access denied" }, { status: 404 });
    }

    const newCap = monthlyCap !== undefined ? monthlyCap : existing.monthlyCap;
    const newThreshold = alertThreshold !== undefined ? alertThreshold : (existing.alertThreshold ?? 0.80);
    const newSoftCap = softCap !== undefined ? softCap : (newCap * newThreshold);

    const newName = name && name.trim() ? name.trim() : undefined;
    if (newName && newName.toLowerCase() !== existing.name.toLowerCase()) {
      if (reinitialize) {
        // User explicitly chose to reinitialize: reset stale rules and overrides to allow fresh AI reclassification
        await reinitializeCategory(userId, existing.name, newName);
      } else {
        // Default 'Just Rename': maintain continuity by updating existing rules and overrides to the new name
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
    }

    const updated = await prisma.budgetCategory.update({
      where: { id },
      data: {
        ...(monthlyCap !== undefined ? { monthlyCap } : {}),
        ...(newName !== undefined ? { name: newName } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(alertThreshold !== undefined ? { alertThreshold } : {}),
        softCap: newSoftCap,
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
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized: Active PayPal session required." }, { status: 401 });
    }
    const userId = authUser.id;
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
