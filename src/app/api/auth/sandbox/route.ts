import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSignedSessionCookie } from "@/lib/auth/session";
import { z } from "zod";

const SandboxLoginSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).optional(),
  persona: z.enum(["GENERAL", "FREELANCER", "BUSINESS"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = SandboxLoginSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: "Invalid email or profile data" },
        { status: 400 }
      );
    }

    const { email, name, persona } = parseResult.data;
    const cleanEmail = email.toLowerCase().trim();
    const fallbackName =
      name ||
      cleanEmail
        .split("@")[0]
        .replace(/[._]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const user = await prisma.user.upsert({
      where: { email: cleanEmail },
      update: {
        name: fallbackName,
      },
      create: {
        email: cleanEmail,
        name: fallbackName,
        persona: persona || "GENERAL",
      },
      include: {
        budgetCategories: true,
        contacts: true,
        scheduledEvents: true,
      },
    });

    const sessionPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
    };

    const signedCookie = createSignedSessionCookie(sessionPayload);

    const userAccount = {
      id: user.id,
      name: user.name || fallbackName,
      email: user.email,
      persona: user.persona,
      industry: user.industry,
      avatar: (user.name || fallbackName)
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2),
      budgetCategories: user.budgetCategories,
      contacts: user.contacts,
      scheduledEvents: user.scheduledEvents,
    };

    const res = NextResponse.json({
      success: true,
      user: userAccount,
    });

    res.cookies.set("pocketmate_user", signedCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: "lax",
    });

    return res;
  } catch (error) {
    console.error("[Sandbox Auth Error]", error);
    return NextResponse.json(
      { success: false, error: "Failed to establish sandbox user session" },
      { status: 500 }
    );
  }
}
