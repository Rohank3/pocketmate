import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  formatUserAvatar,
  PENDING_PAYPAL_COOKIE_NAME,
  verifyPendingPayPalCookie,
  verifySessionCookie,
} from "@/lib/auth/session";
import { formatNameFromEmail } from "@/lib/paypal/auth";

function getPendingPayPalResponse(req: NextRequest) {
  const pending = verifyPendingPayPalCookie(req.cookies.get(PENDING_PAYPAL_COOKIE_NAME)?.value);
  if (!pending) return null;
  return {
    payerId: pending.payerId || null,
    userId: pending.userId,
    suggestedName: pending.suggestedName || "",
  };
}

export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("pocketmate_user")?.value;
    if (!cookie) {
      return NextResponse.json({ user: null, pendingPayPal: getPendingPayPalResponse(req) });
    }

    const verified = verifySessionCookie(cookie);
    if (!verified?.email) {
      return NextResponse.json({ user: null, pendingPayPal: getPendingPayPalResponse(req) });
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
      return NextResponse.json({ user: null, pendingPayPal: getPendingPayPalResponse(req) });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name || formatNameFromEmail(user.email),
        email: user.email,
        persona: user.persona,
        industry: user.industry,
        paypalMerchantId: user.paypalMerchantId,
        paypalOnboardingStatus: user.paypalOnboardingStatus,
        avatar: formatUserAvatar(user.name, user.email),
        budgetCategories: user.budgetCategories,
        contacts: user.contacts,
        scheduledEvents: user.scheduledEvents,
      },
      pendingPayPal: null,
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
