import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionCookie } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("pocketmate_user")?.value;
    if (!cookie) {
      return NextResponse.json({ user: null });
    }

    const verified = verifySessionCookie(cookie);
    if (!verified?.email) {
      return NextResponse.json({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { email: verified.email },
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
        industry: user.industry,
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

export async function POST(req: NextRequest) {
  try {
    const cookie = req.cookies.get("pocketmate_user")?.value;
    if (!cookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const verified = verifySessionCookie(cookie);
    if (!verified?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { persona, industry } = body;

    const updated = await prisma.user.update({
      where: { email: verified.email },
      data: {
        ...(persona ? { persona } : {}),
        ...(industry ? { industry } : {}),
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error("[Update User Profile Error]", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
