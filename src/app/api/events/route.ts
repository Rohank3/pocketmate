import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { reconcileAutopaySubscriptions } from "@/lib/services/autopayReconciliation";
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
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const userEmail = authUser?.email;

    if (!userId) {
      return NextResponse.json({
        success: true,
        events: [],
        reconciliation: { reconciledCount: 0, newSubscriptionsCount: 0, reconciledEventTitles: [] },
      });
    }

    // Autonomous autopay subscription detection & transaction reconciliation
    const reconciliation = await reconcileAutopaySubscriptions(userId, userEmail);

    const events = await prisma.scheduledEvent.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ success: true, events, reconciliation });
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
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const rawBody = await req.json();
    const parseResult = CreateEventSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { title, amount, date, dayOfMonth, type, category, counterparty, status } = parseResult.data;

    const titleLower = title.toLowerCase();
    if (
      titleLower.includes("alert") ||
      titleLower.includes("soft cap") ||
      titleLower.includes("threshold")
    ) {
      return NextResponse.json(
        {
          error:
            "Budget threshold alerts and soft caps must be configured on budget categories, not scheduled as payment events.",
        },
        { status: 400 }
      );
    }

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
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
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
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }
    const body = await req.json();
    const { id, status, counterparty } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Valid Event ID is required" }, { status: 400 });
    }

    if (status && !["pending", "scheduled", "completed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const existing = await prisma.scheduledEvent.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Event not found or access denied" }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (status) updatePayload.status = status;
    if (counterparty !== undefined) updatePayload.counterparty = counterparty;

    const updated = await prisma.scheduledEvent.update({
      where: { id },
      data: updatePayload,
    });

    return NextResponse.json({ success: true, event: updated });
  } catch (error) {
    console.error("[Events PATCH Error]", error);
    return NextResponse.json({ success: false, error: "Failed to update event" }, { status: 500 });
  }
}
