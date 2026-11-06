import { NextRequest, NextResponse } from "next/server";
import { exchangePayPalCodeForTokens, fetchPayPalUserInfo } from "@/lib/paypal/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

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

    const redirectRes = NextResponse.redirect(
      `${appUrl}/?connected=paypal&userName=${encodeURIComponent(user.name || "PayPal User")}&userEmail=${encodeURIComponent(
        user.email
      )}`
    );

    // Set a lightweight session cookie
    redirectRes.cookies.set("pocketmate_user", JSON.stringify({ id: user.id, email: user.email, name: user.name }), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return redirectRes;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[PayPal Auth Callback Error]", error);
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}/?auth_error=exchange_failed`);
  }
}
