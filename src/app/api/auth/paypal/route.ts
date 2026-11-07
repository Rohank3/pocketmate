import { NextResponse } from "next/server";
import { getPayPalOAuthUrl } from "@/lib/paypal/auth";
import crypto from "crypto";

export async function GET() {
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
}
