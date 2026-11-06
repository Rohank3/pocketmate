import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

async function getUserIdFromRequest(req: NextRequest): Promise<string> {
  const cookie = req.cookies.get("pocketmate_user")?.value;
  if (cookie) {
    try {
      const parsed = JSON.parse(cookie);
      if (parsed.email) {
        const u = await prisma.user.findUnique({ where: { email: parsed.email } });
        if (u) return u.id;
      }
    } catch {
      // ignore
    }
  }

  // Fallback to demo user if no cookie session
  const defaultUser = await prisma.user.upsert({
    where: { email: "demo@pocketmate.ai" },
    update: {},
    create: { email: "demo@pocketmate.ai", name: "PocketMate User", persona: "GENERAL" },
  });
  return defaultUser.id;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
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
    const userId = await getUserIdFromRequest(req);
    const { name, monthlyCap, color } = (await req.json()) as {
      name: string;
      monthlyCap: number;
      color?: string;
    };

    if (!name || !monthlyCap) {
      return NextResponse.json({ error: "Name and monthlyCap are required" }, { status: 400 });
    }

    const created = await prisma.budgetCategory.upsert({
      where: {
        userId_name: {
          userId,
          name: name.trim(),
        },
      },
      update: {
        monthlyCap: parseFloat(String(monthlyCap)),
        color: color || "#3b82f6",
      },
      create: {
        userId,
        name: name.trim(),
        monthlyCap: parseFloat(String(monthlyCap)),
        color: color || "#3b82f6",
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
    const { id, monthlyCap, name, color } = (await req.json()) as {
      id: string;
      monthlyCap?: number;
      name?: string;
      color?: string;
    };

    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    const updated = await prisma.budgetCategory.update({
      where: { id },
      data: {
        ...(monthlyCap !== undefined ? { monthlyCap: parseFloat(String(monthlyCap)) } : {}),
        ...(name ? { name: name.trim() } : {}),
        ...(color ? { color } : {}),
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
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
    }

    await prisma.budgetCategory.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Category deleted" });
  } catch (error) {
    console.error("[Categories DELETE Error]", error);
    return NextResponse.json({ success: false, error: "Failed to delete category" }, { status: 500 });
  }
}
