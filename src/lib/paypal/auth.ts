/**
 * PayPal OpenID Connect (Identity API) Client
 * 
 * Implements "Log in with PayPal" OAuth 2.0 flow:
 * - Authorization URL generation
 * - Authorization code exchange for user access token
 * - User profile retrieval (Full name, email, verified status)
 */

import type { NextRequest } from "next/server";

export interface PayPalUserProfile {
  userId: string;
  payerId?: string;
  name: string;
  email: string;
  verifiedAccount?: boolean;
}

export function resolvePublicOrigin(req?: NextRequest): string {
  if (req) {
    const forwardedHost = req.headers.get("x-forwarded-host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
    if (forwardedHost && !forwardedHost.includes("localhost")) {
      return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
    }
    const origin = req.nextUrl?.origin;
    if (origin && !origin.includes("0.0.0.0") && !origin.includes("127.0.0.1")) {
      return origin.replace(/\/$/, "");
    }
  }
  const envUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return envUrl.replace(/\/$/, "");
}

export function getPayPalOAuthUrl(redirectUri?: string, state?: string): string {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  if (!clientId) {
    throw new Error("PAYPAL_CLIENT_ID environment variable is missing.");
  }
  const baseUrl =
    process.env.PAYPAL_ENVIRONMENT === "live"
      ? "https://www.paypal.com"
      : "https://www.sandbox.paypal.com";

  const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const targetRedirect = redirectUri || `${appUrl}/api/auth/callback/paypal`;

  const scopes = encodeURIComponent("openid profile email");
  const stateQuery = state ? `&state=${encodeURIComponent(state)}` : "";
  return `${baseUrl}/connect?flowEntry=static&client_id=${encodeURIComponent(clientId)}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(
    targetRedirect
  )}${stateQuery}`;
}

export async function exchangePayPalCodeForTokens(
  code: string,
  redirectUri?: string
): Promise<{ accessToken: string; idToken?: string }> {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  const baseUrl =
    process.env.PAYPAL_ENVIRONMENT === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const targetRedirect = redirectUri || `${appUrl}/api/auth/callback/paypal`;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=authorization_code&code=${encodeURIComponent(
      code
    )}&redirect_uri=${encodeURIComponent(targetRedirect)}`,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PayPal OAuth token exchange failed: HTTP ${res.status} - ${errorText}`);
  }

  const data = (await res.json()) as { access_token: string; id_token?: string };
  return {
    accessToken: data.access_token,
    idToken: data.id_token,
  };
}

export async function fetchPayPalUserInfo(accessToken: string): Promise<PayPalUserProfile> {
  const baseUrl =
    process.env.PAYPAL_ENVIRONMENT === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  const res = await fetch(`${baseUrl}/v1/identity/openidconnect/userinfo?schema=openid`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch PayPal user info: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    user_id?: string;
    payer_id?: string;
    sub?: string;
    name?: string;
    email?: string;
    verified_account?: boolean;
  };

  return {
    userId: data.user_id || data.sub || `pp_user_${Date.now()}`,
    payerId: data.payer_id,
    name: data.name || "PayPal Sandbox User",
    email: data.email || "user@sandbox.paypal.com",
    verifiedAccount: data.verified_account,
  };
}
