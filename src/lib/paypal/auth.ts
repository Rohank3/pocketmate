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

  const scopes = encodeURIComponent(
    "openid profile email https://uri.paypal.com/services/paypalattributes"
  );
  const stateQuery = state ? `&state=${encodeURIComponent(state)}` : "";
  return `${baseUrl}/signin/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(
    targetRedirect
  )}${stateQuery}`;
}

async function postTokenExchange(
  url: string,
  authHeader: string,
  code: string,
  redirectUri: string
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      Accept: "application/json",
      "Accept-Language": "en_US",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=authorization_code&code=${encodeURIComponent(
      code
    )}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  });
}

export async function exchangePayPalCodeForTokens(
  code: string,
  redirectUri?: string
): Promise<{
  accessToken: string;
  idToken?: string;
  grantedScope?: string;
  tokenSource?: "tokenservice" | "oauth2";
}> {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  const baseUrl =
    process.env.PAYPAL_ENVIRONMENT === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const targetRedirect = redirectUri || `${appUrl}/api/auth/callback/paypal`;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  let tokenSource: "tokenservice" | "oauth2" = "tokenservice";
  let res = await postTokenExchange(
    `${baseUrl}/v1/identity/openidconnect/tokenservice`,
    auth,
    code,
    targetRedirect
  );

  if (!res.ok) {
    tokenSource = "oauth2";
    res = await postTokenExchange(`${baseUrl}/v1/oauth2/token`, auth, code, targetRedirect);
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PayPal OAuth token exchange failed: HTTP ${res.status} - ${errorText}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    id_token?: string;
    scope?: string;
  };
  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    grantedScope: data.scope,
    tokenSource,
  };
}

/**
 * Error thrown when PayPal's OAuth profile endpoints omit an email address.
 * Carries only non-sensitive response metadata (granted scopes, HTTP statuses, JSON keys).
 */
export class PayPalMissingEmailError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super("MISSING_PAYPAL_EMAIL");
    this.name = "PayPalMissingEmailError";
    this.detail = detail;
  }
}

interface PayPalEmailEntry {
  value?: string;
  email?: string;
  primary?: boolean;
}

interface OpenIdUserInfoResponse {
  user_id?: string;
  payer_id?: string;
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_address?: string;
  emails?: Array<string | PayPalEmailEntry>;
  email_verified?: boolean;
  verified_account?: boolean | string;
}

interface PayPalV11UserInfoResponse {
  user_id?: string;
  payer_id?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_address?: string;
  emails?: Array<string | PayPalEmailEntry>;
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

function extractEmailFromSource(source?: {
  email?: string;
  email_address?: string;
  emails?: Array<string | PayPalEmailEntry>;
} | null): string {
  if (!source) return "";
  const direct = source.email?.trim() || source.email_address?.trim();
  if (direct) return direct;
  if (!Array.isArray(source.emails)) return "";

  const normalized = source.emails
    .map((entry) =>
      typeof entry === "string"
        ? { value: entry.trim(), primary: false }
        : { value: (entry?.value || entry?.email || "").trim(), primary: Boolean(entry?.primary) }
    )
    .filter((entry) => Boolean(entry.value));

  return normalized.find((entry) => entry.primary)?.value || normalized[0]?.value || "";
}

/**
 * Fetches the authenticated user's PayPal profile across PayPal's Identity endpoints
 * (openidconnect/userinfo, oauth2/userinfo?schema=openid, oauth2/userinfo?schema=paypalv1.1,
 * and id_token JWT claims) and fails closed with safe metadata if PayPal omits email.
 */
export async function fetchPayPalUserInfo(
  accessToken: string,
  idToken?: string,
  grantedScope?: string,
  tokenSource?: "tokenservice" | "oauth2"
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

  let oauth2OpenidRes: { ok: boolean; status: number; data: OpenIdUserInfoResponse | null } = {
    ok: false,
    status: 0,
    data: null,
  };
  let v11Res: { ok: boolean; status: number; data: PayPalV11UserInfoResponse | null } = {
    ok: false,
    status: 0,
    data: null,
  };
  let pp11Res: { ok: boolean; status: number; data: PayPalV11UserInfoResponse | null } = {
    ok: false,
    status: 0,
    data: null,
  };

  if (!extractEmailFromSource(openid) || !extractDisplayName(openid)) {
    oauth2OpenidRes = await fetchUserInfoSchema<OpenIdUserInfoResponse>(
      baseUrl,
      "/v1/identity/oauth2/userinfo?schema=openid",
      accessToken
    );
  }
  const oauth2Openid = oauth2OpenidRes.data;

  if (
    (!extractEmailFromSource(openid) && !extractEmailFromSource(oauth2Openid)) ||
    (!extractDisplayName(openid) && !extractDisplayName(oauth2Openid))
  ) {
    v11Res = await fetchUserInfoSchema<PayPalV11UserInfoResponse>(
      baseUrl,
      "/v1/identity/oauth2/userinfo?schema=paypalv1.1",
      accessToken
    );
  }
  const v11 = v11Res.data;

  if (
    (!extractEmailFromSource(openid) &&
      !extractEmailFromSource(oauth2Openid) &&
      !extractEmailFromSource(v11)) ||
    (!extractDisplayName(openid) &&
      !extractDisplayName(oauth2Openid) &&
      !extractDisplayName(v11))
  ) {
    pp11Res = await fetchUserInfoSchema<PayPalV11UserInfoResponse>(
      baseUrl,
      "/v1/identity/openidconnect/userinfo?schema=paypalv1.1",
      accessToken
    );
  }
  const pp11 = pp11Res.data;

  if (
    !openidRes.ok &&
    !oauth2OpenidRes.ok &&
    !v11Res.ok &&
    !pp11Res.ok &&
    !extractEmailFromSource(idClaims)
  ) {
    throw new Error(`Failed to fetch PayPal user info: HTTP ${openidRes.status || oauth2OpenidRes.status}`);
  }

  const email =
    extractEmailFromSource(openid) ||
    extractEmailFromSource(oauth2Openid) ||
    extractEmailFromSource(v11) ||
    extractEmailFromSource(pp11) ||
    extractEmailFromSource(idClaims) ||
    "";

  if (!email) {
    const scopeList = (grantedScope || "").split(/\s+/).filter(Boolean);
    const oidcScopes = scopeList.filter(
      (s) => !s.startsWith("http") || s.includes("paypalattributes")
    );
    const uriCount = scopeList.length - oidcScopes.length;
    const keySummary = (obj: object | null | undefined) =>
      obj ? Object.keys(obj).join(",") || "empty" : "null";
    const detail = `tok=${tokenSource || "unknown"}; oidc=[${
      oidcScopes.join(",") || "none"
    }](+${uriCount}uri); openid=${openidRes.status}(${keySummary(
      openid
    )}); o2id=${oauth2OpenidRes.status}(${keySummary(
      oauth2Openid
    )}); v11=${v11Res.status}(${keySummary(v11)}); pp11=${pp11Res.status}(${keySummary(
      pp11
    )}); jwt=(${keySummary(idClaims)})`;

    console.error("[PayPal OAuth Profile Missing Email]", detail, "rawScope:", grantedScope);
    throw new PayPalMissingEmailError(detail);
  }

  const name =
    extractDisplayName(openid) ||
    extractDisplayName(oauth2Openid) ||
    extractDisplayName(v11) ||
    extractDisplayName(pp11) ||
    extractDisplayName(idClaims) ||
    formatNameFromEmail(email);

  const payerId =
    openid?.payer_id ||
    oauth2Openid?.payer_id ||
    v11?.payer_id ||
    pp11?.payer_id ||
    idClaims?.payer_id;
  const userId =
    openid?.user_id ||
    openid?.sub ||
    oauth2Openid?.user_id ||
    oauth2Openid?.sub ||
    v11?.user_id ||
    pp11?.user_id ||
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
      normalizeVerifiedFlag(oauth2Openid?.verified_account) ??
      oauth2Openid?.email_verified ??
      normalizeVerifiedFlag(v11?.verified_account) ??
      normalizeVerifiedFlag(v11?.verified) ??
      normalizeVerifiedFlag(pp11?.verified_account) ??
      normalizeVerifiedFlag(pp11?.verified) ??
      normalizeVerifiedFlag(idClaims?.verified_account),
  };
}
