import { NextResponse } from "next/server";
import { getPayPalOAuthUrl } from "@/lib/paypal/auth";

export async function GET() {
  const authUrl = getPayPalOAuthUrl();
  return NextResponse.redirect(authUrl);
}
