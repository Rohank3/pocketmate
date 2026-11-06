/**
 * PayPal OpenID Connect (Identity API) Client
 * 
 * Implements "Log in with PayPal" OAuth 2.0 flow:
 * - Authorization URL generation
 * - Authorization code exchange for user access token
 * - User profile retrieval (Full name, email, verified status)
 */

export interface PayPalUserProfile {
  userId: string;
  name: string;
  email: string;
  verifiedAccount?: boolean;
}

export function getPayPalOAuthUrl(redirectUri?: string): string {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  const baseUrl =
    process.env.PAYPAL_ENVIRONMENT === "live"
      ? "https://www.paypal.com"
      : "https://www.sandbox.paypal.com";

  const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const targetRedirect = redirectUri || `${appUrl}/api/auth/callback/paypal`;

  const scopes = encodeURIComponent("openid profile email");
  return `${baseUrl}/connect?flowEntry=static&client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(
    targetRedirect
  )}`;
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
    sub?: string;
    name?: string;
    email?: string;
    verified_account?: boolean;
  };

  return {
    userId: data.user_id || data.sub || `pp_user_${Date.now()}`,
    name: data.name || "PayPal Sandbox User",
    email: data.email || "user@sandbox.paypal.com",
    verifiedAccount: data.verified_account,
  };
}
