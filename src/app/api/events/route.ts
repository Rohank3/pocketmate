import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { z } from "zod";

const CreateEventSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  amount: z.number().finite().nonnegative("Amount must be non-negative").max(1000000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  dayOfMonth: z.number().int().min(1).max(31),
  type: z.enum(["incoming", "outgoing", "milestone"]).default("outgoing"),
  category: z.string().trim().min(1).max(50).default("General"),
  counterparty: z.string().trim().max(100).nullable().optional(),
  status: z.enum(["pending", "scheduled", "completed"]).default("scheduled"),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    let events = await prisma.scheduledEvent.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    });

    if (events.length === 0) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");

      await prisma.scheduledEvent.createMany({
        data: [
          {
            userId,
            title: "Cloud Infrastructure (AWS / Cloudflare)",
            amount: 95.0,
            date: `${year}-${month}-12`,
            dayOfMonth: 12,
            type: "outgoing",
            category: "Utilities",
            counterparty: "AWS",
            status: "scheduled",
          },
          {
            userId,
            title: "Streaming & Entertainment Subscriptions",
            amount: 24.99,
            date: `${year}-${month}-18`,
            dayOfMonth: 18,
            type: "outgoing",
            category: "Entertainment",
            counterparty: "Digital Services",
            status: "scheduled",
          },
          {
            userId,
            title: "Mid-Month Budget Checkpoint",
            amount: 0.0,
            date: `${year}-${month}-15`,
            dayOfMonth: 15,
            type: "milestone",
            category: "General",
            status: "scheduled",
          },
        ],
      });

      events = await prisma.scheduledEvent.findMany({
        where: { userId },
        orderBy: { date: "asc" },
      });
    }

    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error("[Events GET Error]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser && process.env.PAYPAL_ENVIRONMENT === "live") {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);
    const rawBody = await req.json();
    const parseResult = CreateEventSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { title, amount, date, dayOfMonth, type, category, counterparty, status } = parseResult.data;

    const created = await prisma.scheduledEvent.create({
      data: {
        userId,
        title,
        amount,
        date,
        dayOfMonth,
        type,
        category,
        counterparty: counterparty || null,
        status,
      },
    });

    return NextResponse.json({ success: true, event: created });
  } catch (error) {
    console.error("[Events POST Error]", error);
    return NextResponse.json({ success: false, error: "Failed to create event" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser && process.env.PAYPAL_ENVIRONMENT === "live") {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Valid Event ID is required" }, { status: 400 });
    }

    const existing = await prisma.scheduledEvent.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Event not found or access denied" }, { status: 404 });
    }

    await prisma.scheduledEvent.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Event deleted" });
  } catch (error) {
    console.error("[Events DELETE Error]", error);
    return NextResponse.json({ success: false, error: "Failed to delete event" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser && process.env.PAYPAL_ENVIRONMENT === "live") {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);
    const body = await req.json();
    const { id, status } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Valid Event ID is required" }, { status: 400 });
    }

    if (!["pending", "scheduled", "completed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const existing = await prisma.scheduledEvent.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Event not found or access denied" }, { status: 404 });
    }

    const updated = await prisma.scheduledEvent.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true, event: updated });
  } catch (error) {
    console.error("[Events PATCH Error]", error);
    return NextResponse.json({ success: false, error: "Failed to update event" }, { status: 500 });
  }
}
