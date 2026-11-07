import { NextRequest, NextResponse } from "next/server";
import { exchangePayPalCodeForTokens, fetchPayPalUserInfo } from "@/lib/paypal/auth";
import { prisma } from "@/lib/db";
import { createSignedSessionCookie } from "@/lib/auth/session";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const stateParam = req.nextUrl.searchParams.get("state");
    const savedState = req.cookies.get("paypal_oauth_state")?.value;
    const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

    const isStateValid =
      Boolean(savedState) &&
      Boolean(stateParam) &&
      savedState!.length === stateParam!.length &&
      crypto.timingSafeEqual(Buffer.from(savedState!), Buffer.from(stateParam!));

    if (!isStateValid) {
      return NextResponse.redirect(`${appUrl}/?auth_error=invalid_state`);
    }

    if (!code) {
      return NextResponse.redirect(`${appUrl}/?auth_error=missing_code`);
    }

    // Exchange auth code for user access token
    const { accessToken } = await exchangePayPalCodeForTokens(code);

    // Fetch user profile from PayPal OpenID Connect endpoint
    const profile = await fetchPayPalUserInfo(accessToken);

    // Upsert user into live Neon PostgreSQL database
    const user = await prisma.user.upsert({
      where: { email: profile.email },
      update: {
        name: profile.name,
      },
      create: {
        email: profile.email,
        name: profile.name,
        persona: "GENERAL",
      },
    });

    // Ensure default budget categories exist for this user in DB
    const catCount = await prisma.budgetCategory.count({ where: { userId: user.id } });
    if (catCount === 0) {
      await prisma.budgetCategory.createMany({
        data: [
          { userId: user.id, name: "Groceries", monthlyCap: 400.0, currentSpent: 0.0, color: "#10b981" },
          { userId: user.id, name: "Dining", monthlyCap: 250.0, currentSpent: 0.0, color: "#3b82f6" },
          { userId: user.id, name: "Shopping", monthlyCap: 300.0, currentSpent: 0.0, color: "#ec4899" },
          { userId: user.id, name: "Entertainment", monthlyCap: 200.0, currentSpent: 0.0, color: "#8b5cf6" },
        ],
      });
    }

    const redirectRes = NextResponse.redirect(
      `${appUrl}/?connected=paypal&userName=${encodeURIComponent(user.name || "PayPal User")}&userEmail=${encodeURIComponent(
        user.email
      )}`
    );

    redirectRes.cookies.set("paypal_oauth_state", "", { maxAge: 0, path: "/" });
    redirectRes.cookies.set(
      "pocketmate_user",
      createSignedSessionCookie({ id: user.id, email: user.email, name: user.name }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
      }
    );

    return redirectRes;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[PayPal Auth Callback Error]", error);
    const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}/?auth_error=exchange_failed`);
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Direct simulated/manual login has been permanently decommissioned for security. All authentication must occur via official PayPal OpenID Connect (/api/auth/paypal).",
    },
    { status: 403 }
  );
}
