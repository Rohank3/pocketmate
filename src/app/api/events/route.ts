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
    const userId = await getUserIdFromRequest(req);
    const body = await req.json();

    const created = await prisma.scheduledEvent.create({
      data: {
        userId,
        title: body.title,
        amount: parseFloat(String(body.amount || 0)),
        date: body.date,
        dayOfMonth: parseInt(String(body.dayOfMonth || 1)),
        type: body.type || "outgoing",
        category: body.category || "General",
        counterparty: body.counterparty || null,
        status: body.status || "scheduled",
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
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Event ID is required" }, { status: 400 });
    }

    await prisma.scheduledEvent.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Event deleted" });
  } catch (error) {
    console.error("[Events DELETE Error]", error);
    return NextResponse.json({ success: false, error: "Failed to delete event" }, { status: 500 });
  }
}
