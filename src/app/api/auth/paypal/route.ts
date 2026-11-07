import { NextResponse } from "next/server";
import { getPayPalOAuthUrl } from "@/lib/paypal/auth";
import crypto from "crypto";

export async function GET() {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = getPayPalOAuthUrl(undefined, state);
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
    const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}/?auth_error=missing_credentials`);
  }
}
