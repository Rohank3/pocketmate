import { NextRequest, NextResponse } from "next/server";
import { exchangePayPalCodeForTokens, fetchPayPalUserInfo, resolvePublicOrigin } from "@/lib/paypal/auth";
import { prisma } from "@/lib/db";
import { createSignedSessionCookie } from "@/lib/auth/session";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const appUrl = resolvePublicOrigin(req);
  try {
    const code = req.nextUrl.searchParams.get("code");
    const stateParam = req.nextUrl.searchParams.get("state");
    const savedState = req.cookies.get("paypal_oauth_state")?.value;

    const isStateValid =
      Boolean(savedState) &&
      Boolean(stateParam) &&
      savedState!.length === stateParam!.length &&
      crypto.timingSafeEqual(Buffer.from(savedState!), Buffer.from(stateParam!));

    if (!isStateValid) {
      return NextResponse.redirect(`${appUrl}/?auth_error=invalid_state`);
    }

    if (!code) {
      const providerError = req.nextUrl.searchParams.get("error");
      const errorDesc = req.nextUrl.searchParams.get("error_description");
      if (providerError) {
        console.error("[PayPal OAuth Provider Error]", providerError, errorDesc);
      }
      const mapped =
        providerError === "access_denied"
          ? "access_denied"
          : providerError === "invalid_scope"
            ? "invalid_scope"
            : "missing_code";
      return NextResponse.redirect(`${appUrl}/?auth_error=${mapped}`);
    }

    // Exchange auth code for user access token using the exact request origin callback URI
    const redirectUri = `${appUrl}/api/auth/callback/paypal`;
    const { accessToken, idToken } = await exchangePayPalCodeForTokens(code, redirectUri);

    // Fetch user profile from PayPal OpenID Connect / v1.1 / id_token claims
    const profile = await fetchPayPalUserInfo(accessToken, idToken);

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

    // Ensure starter budget categories exist for this user in DB
    const catCount = await prisma.budgetCategory.count({ where: { userId: user.id } });
    if (catCount === 0) {
      await prisma.budgetCategory.createMany({
        data: [
          { userId: user.id, name: "Groceries", monthlyCap: 400.0, currentSpent: 0.0, color: "#10b981", alertThreshold: 0.80, softCap: 320.0 },
          { userId: user.id, name: "Dining", monthlyCap: 250.0, currentSpent: 0.0, color: "#3b82f6", alertThreshold: 0.80, softCap: 200.0 },
          { userId: user.id, name: "Shopping", monthlyCap: 300.0, currentSpent: 0.0, color: "#ec4899", alertThreshold: 0.80, softCap: 240.0 },
          { userId: user.id, name: "Entertainment", monthlyCap: 200.0, currentSpent: 0.0, color: "#8b5cf6", alertThreshold: 0.80, softCap: 160.0 },
          { userId: user.id, name: "Travel", monthlyCap: 600.0, currentSpent: 0.0, color: "#f59e0b", alertThreshold: 0.80, softCap: 480.0 },
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
    const errorCode =
      error instanceof Error && error.message === "MISSING_PAYPAL_EMAIL"
        ? "missing_email"
        : "exchange_failed";
    return NextResponse.redirect(`${appUrl}/?auth_error=${errorCode}`);
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
