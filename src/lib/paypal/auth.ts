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

interface OpenIdUserInfoResponse {
  user_id?: string;
  payer_id?: string;
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  verified_account?: boolean | string;
}

interface PayPalV11UserInfoResponse {
  user_id?: string;
  payer_id?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  emails?: Array<{ value?: string; primary?: boolean }>;
  verified_account?: boolean | string;
  verified?: boolean | string;
}

function decodePayPalIdTokenClaims(idToken?: string): OpenIdUserInfoResponse | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as OpenIdUserInfoResponse) : null;
  } catch {
    return null;
  }
}

function extractDisplayName(source?: {
  name?: string;
  given_name?: string;
  family_name?: string;
} | null): string {
  if (!source) return "";
  const full = source.name?.trim();
  if (full) return full;
  return [source.given_name?.trim(), source.family_name?.trim()].filter(Boolean).join(" ");
}

function formatNameFromEmail(email: string): string {
  const local = email.split("@")[0] || "";
  const formatted = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return formatted || "PayPal Account";
}

function normalizeVerifiedFlag(value?: boolean | string): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

async function fetchUserInfoSchema<T>(
  baseUrl: string,
  path: string,
  accessToken: string
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, data: null };
  }
  const data = (await res.json()) as T;
  return { ok: true, status: res.status, data };
}

/**
 * Fetches the authenticated user's PayPal profile using OpenID Connect,
 * falling back to PayPal v1.1 userinfo and id_token JWT claims when fields
 * are omitted, and fails closed if PayPal returns no email address.
 */
export async function fetchPayPalUserInfo(
  accessToken: string,
  idToken?: string
): Promise<PayPalUserProfile> {
  const baseUrl =
    process.env.PAYPAL_ENVIRONMENT === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  const idClaims = decodePayPalIdTokenClaims(idToken);
  const openidRes = await fetchUserInfoSchema<OpenIdUserInfoResponse>(
    baseUrl,
    "/v1/identity/openidconnect/userinfo?schema=openid",
    accessToken
  );
  const openid = openidRes.data;

  const hasOpenIdEmail = Boolean(openid?.email?.trim());
  const hasOpenIdName = Boolean(extractDisplayName(openid));

  let v11: PayPalV11UserInfoResponse | null = null;
  if (!hasOpenIdEmail || !hasOpenIdName) {
    const v11Res = await fetchUserInfoSchema<PayPalV11UserInfoResponse>(
      baseUrl,
      "/v1/identity/oauth2/userinfo?schema=paypalv1.1",
      accessToken
    );
    v11 = v11Res.data;

    if (!openidRes.ok && !v11Res.ok && !idClaims?.email) {
      throw new Error(`Failed to fetch PayPal user info: HTTP ${openidRes.status}`);
    }
  }

  const v11Email =
    v11?.emails?.find((entry) => entry.primary && entry.value?.trim())?.value ||
    v11?.emails?.find((entry) => entry.value?.trim())?.value;

  const email =
    openid?.email?.trim() || v11Email?.trim() || idClaims?.email?.trim() || "";

  if (!email) {
    console.error("[PayPal OAuth Profile Missing Email]", {
      openidStatus: openidRes.status,
      openidKeys: openid ? Object.keys(openid) : null,
      v11Keys: v11 ? Object.keys(v11) : null,
      idTokenKeys: idClaims ? Object.keys(idClaims) : null,
    });
    throw new Error("MISSING_PAYPAL_EMAIL");
  }

  const name =
    extractDisplayName(openid) ||
    extractDisplayName(v11) ||
    extractDisplayName(idClaims) ||
    formatNameFromEmail(email);

  const payerId = openid?.payer_id || v11?.payer_id || idClaims?.payer_id;
  const userId =
    openid?.user_id ||
    openid?.sub ||
    v11?.user_id ||
    idClaims?.user_id ||
    idClaims?.sub ||
    payerId ||
    email;

  return {
    userId,
    payerId,
    name,
    email,
    verifiedAccount:
      normalizeVerifiedFlag(openid?.verified_account) ??
      openid?.email_verified ??
      normalizeVerifiedFlag(v11?.verified_account) ??
      normalizeVerifiedFlag(v11?.verified) ??
      normalizeVerifiedFlag(idClaims?.verified_account),
  };
}
