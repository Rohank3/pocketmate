import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const CreateSplitApiSchema = z.object({
  title: z.string().trim().min(1).max(200),
  totalAmount: z.number().finite().positive().max(500000),
  currency: z.string().default("USD"),
  items: z.array(
    z.object({
      participantName: z.string().trim().min(1).max(100),
      participantEmail: z.string().trim().email().optional(),
      amount: z.number().finite().positive().max(500000),
    })
  ).min(1).max(50),
});

const UpdateSplitItemSchema = z.object({
  itemId: z.string().min(1),
  status: z.enum(["DRAFT", "SENT", "PAID", "CANCELLED", "FAILED"]),
});

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json({ success: true, splits: [] });
    }

    const splits = await prisma.splitRecord.findMany({
      where: { userId },
      include: {
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, splits });
  } catch (error) {
    console.error("[Splits GET Error]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch splits" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parseResult = CreateSplitApiSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { title, totalAmount, items } = parseResult.data;

    const created = await prisma.splitRecord.create({
      data: {
        userId,
        totalAmount,
        status: "PENDING_CONFIRMATION",
        description: title,
        itemsJson: items as unknown as Prisma.InputJsonValue,
        items: {
          create: items.map((item) => ({
            participantName: item.participantName,
            participantEmail: item.participantEmail || `${item.participantName.toLowerCase().replace(/\s+/g, ".")}@personal.example.com`,
            amount: item.amount,
            status: "DRAFT",
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json({ success: true, split: created });
  } catch (error) {
    console.error("[Splits POST Error]", error);
    return NextResponse.json({ success: false, error: "Failed to create split record" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parseResult = UpdateSplitItemSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { itemId, status } = parseResult.data;

    const existingItem = await prisma.splitItem.findUnique({
      where: { id: itemId },
      include: { splitRecord: true },
    });

    if (!existingItem || existingItem.splitRecord.userId !== userId) {
      return NextResponse.json({ success: false, error: "Split item not found or unauthorized" }, { status: 404 });
    }

    const updated = await prisma.splitItem.update({
      where: { id: itemId },
      data: { status },
    });

    // If all items are paid, mark the splitRecord as SETTLED
    const remainingUnpaid = await prisma.splitItem.count({
      where: {
        splitRecordId: existingItem.splitRecordId,
        status: { notIn: ["PAID", "CANCELLED"] },
      },
    });

    if (remainingUnpaid === 0) {
      await prisma.splitRecord.update({
        where: { id: existingItem.splitRecordId },
        data: { status: "SETTLED" },
      });
    }

    return NextResponse.json({ success: true, item: updated });
  } catch (error) {
    console.error("[Splits PATCH Error]", error);
    return NextResponse.json({ success: false, error: "Failed to update split item" }, { status: 500 });
  }
}
