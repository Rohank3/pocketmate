import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: true, messages: [] });
    }

    const threadId = req.nextUrl.searchParams.get("threadId");
    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json({ error: "Valid threadId is required" }, { status: 400 });
    }

    // Verify ownership
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: user.id },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found or access denied" }, { status: 404 });
    }

    // Fetch up to the last 30 messages (ordered chronologically)
    const rawMessages = await prisma.chatMessage.findMany({
      where: { threadId, userId: user.id },
      take: 30,
      orderBy: { createdAt: "desc" },
    });

    const messages = rawMessages.reverse().map((m) => {
      let parsedToolCalls: Record<string, unknown> | undefined = undefined;
      if (m.toolCallsJson) {
        try {
          parsedToolCalls = typeof m.toolCallsJson === "string"
            ? JSON.parse(m.toolCallsJson)
            : (m.toolCallsJson as Record<string, unknown>);
        } catch {
          // ignore
        }
      }

      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        actionCard: parsedToolCalls?.actionCard || undefined,
        toolBadges: Array.isArray(parsedToolCalls?.toolBadges)
          ? (parsedToolCalls.toolBadges as string[])
          : undefined,
        createdAt: m.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ success: true, messages });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[Chat Messages GET Error]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch messages" }, { status: 500 });
  }
}
