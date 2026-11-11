import { NextRequest, NextResponse } from "next/server";
import { getPayPalOAuthUrl, resolvePublicOrigin } from "@/lib/paypal/auth";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const appUrl = resolvePublicOrigin(req);
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const redirectUri = `${appUrl}/api/auth/callback/paypal`;
    const authUrl = getPayPalOAuthUrl(redirectUri, state);
    const response = NextResponse.redirect(authUrl);
    response.cookies.set("paypal_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("[PayPal OAuth Init Error]", err);
    return NextResponse.redirect(`${appUrl}/?auth_error=missing_credentials`);
  }
}
