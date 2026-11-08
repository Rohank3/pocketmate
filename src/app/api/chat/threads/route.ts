import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: true, threads: [] });
    }

    const threads = await prisma.chatThread.findMany({
      where: { userId: user.id },
      include: {
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { content: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const formatted = threads.map((t) => ({
      id: t.id,
      title: t.title,
      messageCount: t._count.messages,
      updatedAt: t.updatedAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
      lastMessageSnippet: t.messages[0]?.content?.slice(0, 80) || "",
    }));

    return NextResponse.json({ success: true, threads: formatted });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[Chat Threads GET Error]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch chat threads" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }

    const body = await req.json();

    // If ID provided, handle rename
    if (body.id && typeof body.id === "string") {
      const existing = await prisma.chatThread.findFirst({
        where: { id: body.id, userId: user.id },
      });

      if (!existing) {
        return NextResponse.json({ error: "Thread not found or access denied" }, { status: 404 });
      }

      const safeTitle = typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 100)
        : "Conversation";

      const updated = await prisma.chatThread.update({
        where: { id: body.id },
        data: { title: safeTitle },
      });

      return NextResponse.json({ success: true, thread: updated });
    }

    // Otherwise create new thread
    const initialTitle = typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 100)
      : "New Conversation";

    const newThread = await prisma.chatThread.create({
      data: {
        userId: user.id,
        title: initialTitle,
      },
    });

    return NextResponse.json({ success: true, thread: newThread });
  } catch (error) {
    console.error("[Chat Threads POST Error]", error);
    return NextResponse.json({ success: false, error: "Failed to create or update thread" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Valid thread ID is required" }, { status: 400 });
    }

    const existing = await prisma.chatThread.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Thread not found or access denied" }, { status: 404 });
    }

    await prisma.chatThread.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Thread deleted" });
  } catch (error) {
    console.error("[Chat Threads DELETE Error]", error);
    return NextResponse.json({ success: false, error: "Failed to delete thread" }, { status: 500 });
  }
}
