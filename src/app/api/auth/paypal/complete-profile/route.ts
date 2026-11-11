import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSignedSessionCookie,
  ensureStarterCategoriesForUser,
  formatUserAvatar,
  PENDING_PAYPAL_COOKIE_NAME,
  verifyPendingPayPalCookie,
} from "@/lib/auth/session";
import { formatNameFromEmail } from "@/lib/paypal/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Completes PayPal OAuth sign-in by binding an email address to a verified
 * PayPal identity cookie when PayPal Sandbox omits email from /userinfo.
 */
export async function POST(req: NextRequest) {
  try {
    const pendingCookie = req.cookies.get(PENDING_PAYPAL_COOKIE_NAME)?.value;
    const pending = verifyPendingPayPalCookie(pendingCookie);
    if (!pending) {
      return NextResponse.json(
        { error: "PayPal sign-in session expired. Please click Log In with PayPal again." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as { email?: unknown; name?: unknown };
    const cleanEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const rawName = typeof body.name === "string" ? body.name.trim() : "";

    if (!EMAIL_REGEX.test(cleanEmail) || cleanEmail === "user@sandbox.paypal.com") {
      return NextResponse.json(
        { error: "Please enter a valid PayPal Sandbox account email address." },
        { status: 400 }
      );
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true, paypalOAuthId: true, paypalMerchantId: true, name: true },
    });

    if (
      existingByEmail?.paypalOAuthId &&
      existingByEmail.paypalOAuthId !== pending.oauthId
    ) {
      return NextResponse.json(
        { error: "That email is already linked to a different PayPal account." },
        { status: 409 }
      );
    }

    const existingByOAuth = await prisma.user.findFirst({
      where: {
        paypalOAuthId: pending.oauthId,
        NOT: { email: cleanEmail },
      },
      select: { id: true },
    });
    if (existingByOAuth) {
      return NextResponse.json(
        { error: "This PayPal account is already linked to a different email." },
        { status: 409 }
      );
    }

    const displayName = rawName || pending.suggestedName || formatNameFromEmail(cleanEmail);

    const upserted = await prisma.user.upsert({
      where: { email: cleanEmail },
      update: {
        paypalOAuthId: pending.oauthId,
        ...(rawName || !existingByEmail?.name ? { name: displayName } : {}),
        ...(pending.payerId && !existingByEmail?.paypalMerchantId
          ? { paypalMerchantId: pending.payerId }
          : {}),
      },
      create: {
        email: cleanEmail,
        name: displayName,
        persona: "GENERAL",
        paypalOAuthId: pending.oauthId,
        ...(pending.payerId ? { paypalMerchantId: pending.payerId } : {}),
      },
      include: {
        budgetCategories: true,
        contacts: true,
        scheduledEvents: true,
      },
    });

    await ensureStarterCategoriesForUser(upserted.id);

    const hydrated = await prisma.user.findUnique({
      where: { id: upserted.id },
      include: {
        budgetCategories: true,
        contacts: true,
        scheduledEvents: true,
      },
    });
    const activeUser = hydrated || upserted;

    const response = NextResponse.json({
      user: {
        id: activeUser.id,
        name: activeUser.name || formatNameFromEmail(activeUser.email),
        email: activeUser.email,
        persona: activeUser.persona,
        industry: activeUser.industry,
        paypalMerchantId: activeUser.paypalMerchantId,
        paypalOnboardingStatus: activeUser.paypalOnboardingStatus,
        avatar: formatUserAvatar(activeUser.name, activeUser.email),
        budgetCategories: activeUser.budgetCategories,
        contacts: activeUser.contacts,
        scheduledEvents: activeUser.scheduledEvents,
      },
    });

    response.cookies.set(PENDING_PAYPAL_COOKIE_NAME, "", { maxAge: 0, path: "/" });
    response.cookies.set(
      "pocketmate_user",
      createSignedSessionCookie({
        id: activeUser.id,
        email: activeUser.email,
        name: activeUser.name,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      }
    );

    return response;
  } catch (error) {
    console.error("[PayPal Complete Profile Error]", error);
    return NextResponse.json(
      { error: "Failed to link PayPal account email. Please try again." },
      { status: 500 }
    );
  }
}
