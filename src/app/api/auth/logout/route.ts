import { NextResponse } from "next/server";
import { PENDING_PAYPAL_COOKIE_NAME } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  const clearOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
  response.cookies.set("pocketmate_user", "", clearOpts);
  response.cookies.set(PENDING_PAYPAL_COOKIE_NAME, "", clearOpts);
  return response;
}

export async function GET() {
  return POST();
}
