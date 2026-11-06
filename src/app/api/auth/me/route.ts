import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("pocketmate_user")?.value;
    if (!cookie) {
      return NextResponse.json({ user: null });
    }

    let parsed: { id?: string; email?: string; name?: string } | null = null;
    try {
      parsed = JSON.parse(cookie);
    } catch {
      return NextResponse.json({ user: null });
    }

    if (!parsed?.email) {
      return NextResponse.json({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.email },
      include: {
        budgetCategories: true,
        contacts: true,
        scheduledEvents: true,
      },
    });

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name || "PayPal Sandbox User",
        email: user.email,
        persona: user.persona,
        avatar: (user.name || user.email)
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2),
        budgetCategories: user.budgetCategories,
        contacts: user.contacts,
        scheduledEvents: user.scheduledEvents,
      },
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[Auth Me API Error]", error);
    return NextResponse.json({ error: "Failed to fetch user session" }, { status: 500 });
  }
}
