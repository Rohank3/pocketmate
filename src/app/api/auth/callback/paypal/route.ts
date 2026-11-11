import { NextRequest, NextResponse } from "next/server";
import {
  exchangePayPalCodeForTokens,
  fetchPayPalUserInfo,
  PayPalMissingEmailError,
  resolvePublicOrigin,
} from "@/lib/paypal/auth";
import { prisma } from "@/lib/db";
import {
  createSignedPendingPayPalCookie,
  createSignedSessionCookie,
  ensureStarterCategoriesForUser,
  PENDING_PAYPAL_COOKIE_NAME,
} from "@/lib/auth/session";
import crypto from "crypto";

function redirectWithAuthenticatedSession(
  appUrl: string,
  user: { id: string; email: string; name: string | null }
): NextResponse {
  const redirectRes = NextResponse.redirect(
    `${appUrl}/?connected=paypal&userName=${encodeURIComponent(user.name || "PayPal User")}&userEmail=${encodeURIComponent(
      user.email
    )}`
  );

  redirectRes.cookies.set("paypal_oauth_state", "", { maxAge: 0, path: "/" });
  redirectRes.cookies.set(PENDING_PAYPAL_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  redirectRes.cookies.set(
    "pocketmate_user",
    createSignedSessionCookie({ id: user.id, email: user.email, name: user.name }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    }
  );
  return redirectRes;
}

export async function GET(req: NextRequest) {
  const appUrl = resolvePublicOrigin(req);
  try {
    const code = req.nextUrl.searchParams.get("code");
    const stateParam = req.nextUrl.searchParams.get("state");
    const savedState = req.cookies.get("paypal_oauth_state")?.value;

    const isStateValid =
      Boolean(savedState) &&
      Boolean(stateParam) &&
      savedState!.length === stateParam!.length &&
      crypto.timingSafeEqual(Buffer.from(savedState!), Buffer.from(stateParam!));

    if (!isStateValid) {
      return NextResponse.redirect(`${appUrl}/?auth_error=invalid_state`);
    }

    if (!code) {
      const providerError = req.nextUrl.searchParams.get("error");
      const errorDesc = req.nextUrl.searchParams.get("error_description");
      if (providerError) {
        console.error("[PayPal OAuth Provider Error]", providerError, errorDesc);
      }
      const mapped =
        providerError === "access_denied"
          ? "access_denied"
          : providerError === "invalid_scope"
            ? "invalid_scope"
            : "missing_code";
      return NextResponse.redirect(`${appUrl}/?auth_error=${mapped}`);
    }

    // Exchange auth code for user access token using the exact request origin callback URI
    const redirectUri = `${appUrl}/api/auth/callback/paypal`;
    const { accessToken, idToken, grantedScope, tokenSource } = await exchangePayPalCodeForTokens(
      code,
      redirectUri
    );

    // Fetch user profile from PayPal OpenID Connect / oauth2 / v1.1 / id_token claims
    const profile = await fetchPayPalUserInfo(accessToken, idToken, grantedScope, tokenSource);

    // Upsert user into live Neon PostgreSQL database
    const oauthKey = profile.payerId || profile.userId;
    const existing = await prisma.user.findUnique({
      where: { email: profile.email.toLowerCase().trim() },
      select: { paypalMerchantId: true },
    });
    const user = await prisma.user.upsert({
      where: { email: profile.email.toLowerCase().trim() },
      update: {
        name: profile.name,
        paypalOAuthId: oauthKey,
        ...(profile.payerId && !existing?.paypalMerchantId
          ? { paypalMerchantId: profile.payerId }
          : {}),
      },
      create: {
        email: profile.email.toLowerCase().trim(),
        name: profile.name,
        persona: "GENERAL",
        paypalOAuthId: oauthKey,
        ...(profile.payerId ? { paypalMerchantId: profile.payerId } : {}),
      },
    });

    await ensureStarterCategoriesForUser(user.id);
    return redirectWithAuthenticatedSession(appUrl, user);
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[PayPal Auth Callback Error]", error);
    if (error instanceof PayPalMissingEmailError) {
      const identity = error.identity;
      if (identity?.userId || identity?.payerId) {
        const oauthId = identity.payerId || identity.userId;
        const linkedUser = await prisma.user.findFirst({
          where: {
            OR: [
              { paypalOAuthId: oauthId },
              { paypalOAuthId: identity.userId },
              ...(identity.payerId ? [{ paypalMerchantId: identity.payerId }] : []),
            ],
          },
          select: { id: true, email: true, name: true, paypalOAuthId: true },
        });

        if (linkedUser) {
          if (!linkedUser.paypalOAuthId) {
            await prisma.user.update({
              where: { id: linkedUser.id },
              data: { paypalOAuthId: oauthId },
            });
          }
          await ensureStarterCategoriesForUser(linkedUser.id);
          return redirectWithAuthenticatedSession(appUrl, linkedUser);
        }

        const pendingRes = NextResponse.redirect(
          `${appUrl}/?auth_step=confirm_email${
            identity.payerId ? `&pp_payer=${encodeURIComponent(identity.payerId)}` : ""
          }`
        );
        pendingRes.cookies.set("paypal_oauth_state", "", { maxAge: 0, path: "/" });
        pendingRes.cookies.set(
          PENDING_PAYPAL_COOKIE_NAME,
          createSignedPendingPayPalCookie({
            oauthId,
            userId: identity.userId,
            payerId: identity.payerId,
            suggestedName: identity.name,
          }),
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 15,
            path: "/",
          }
        );
        return pendingRes;
      }

      const detailQuery = error.detail
        ? `&auth_detail=${encodeURIComponent(error.detail.slice(0, 320))}`
        : "";
      return NextResponse.redirect(`${appUrl}/?auth_error=missing_email${detailQuery}`);
    }
    return NextResponse.redirect(`${appUrl}/?auth_error=exchange_failed`);
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Direct simulated/manual login has been permanently decommissioned for security. All authentication must occur via official PayPal OpenID Connect (/api/auth/paypal).",
    },
    { status: 403 }
  );
}
