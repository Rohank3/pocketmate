import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../db";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === "production"
    ? (() => {
        throw new Error("CRITICAL: SESSION_SECRET or NEXTAUTH_SECRET must be configured in production.");
      })()
    : "pocketmate-sandbox-internal-secret-session-key-32b-min");

export interface SessionPayload {
  id: string;
  email: string;
  name: string | null;
  issuedAt: number;
}

export interface PendingPayPalIdentity {
  oauthId: string;
  userId: string;
  payerId?: string;
  suggestedName?: string;
  issuedAt: number;
}

export const PENDING_PAYPAL_COOKIE_NAME = "pocketmate_paypal_pending";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_PAYPAL_MAX_AGE_MS = 15 * 60 * 1000;

function signHmacPayload<T extends object>(payload: T): string {
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(base64Payload)
    .digest("base64url");
  return `${base64Payload}.${signature}`;
}

function verifyHmacPayload<T extends { issuedAt?: unknown }>(
  cookieValue: string | undefined,
  maxAgeMs: number
): T | null {
  if (!cookieValue || typeof cookieValue !== "string" || !cookieValue.includes(".")) {
    return null;
  }

  const parts = cookieValue.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [base64Payload, signature] = parts;
  try {
    const expectedSig = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(base64Payload)
      .digest("base64url");

    if (
      signature.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
    ) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(base64Payload, "base64url").toString("utf-8")) as T;
    if (
      !parsed ||
      typeof parsed.issuedAt !== "number" ||
      Date.now() - parsed.issuedAt > maxAgeMs ||
      parsed.issuedAt > Date.now() + 60000
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Creates an HMAC-SHA256 signed session cookie payload.
 */
export function createSignedSessionCookie(user: { id: string; email: string; name: string | null }): string {
  const payload: SessionPayload = {
    id: user.id,
    email: user.email.trim().toLowerCase(),
    name: user.name ?? null,
    issuedAt: Date.now(),
  };
  return signHmacPayload(payload);
}

/**
 * Verifies an HMAC-SHA256 signed session cookie payload.
 */
export function verifySessionCookie(cookieValue?: string): SessionPayload | null {
  const parsed = verifyHmacPayload<SessionPayload>(cookieValue, SESSION_MAX_AGE_MS);
  if (!parsed || typeof parsed.email !== "string" || !parsed.email.includes("@")) {
    return null;
  }
  return parsed;
}

/**
 * Creates a short-lived signed cookie holding a verified PayPal OAuth identity
 * when PayPal Sandbox omits the email claim from /userinfo.
 */
export function createSignedPendingPayPalCookie(
  identity: Omit<PendingPayPalIdentity, "issuedAt">
): string {
  return signHmacPayload<PendingPayPalIdentity>({
    ...identity,
    issuedAt: Date.now(),
  });
}

/**
 * Verifies a pending PayPal OAuth identity cookie.
 */
export function verifyPendingPayPalCookie(cookieValue?: string): PendingPayPalIdentity | null {
  const parsed = verifyHmacPayload<PendingPayPalIdentity>(cookieValue, PENDING_PAYPAL_MAX_AGE_MS);
  if (!parsed || typeof parsed.oauthId !== "string" || !parsed.oauthId.trim()) {
    return null;
  }
  return parsed;
}

/**
 * Computes two-letter user initials for UI avatars.
 */
export function formatUserAvatar(name: string | null | undefined, email: string): string {
  return (name || email)
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Provisions default starter budget categories when a user account has none.
 */
export async function ensureStarterCategoriesForUser(userId: string): Promise<void> {
  const catCount = await prisma.budgetCategory.count({ where: { userId } });
  if (catCount > 0) return;
  await prisma.budgetCategory.createMany({
    data: [
      { userId, name: "Groceries", monthlyCap: 400.0, currentSpent: 0.0, color: "#10b981", alertThreshold: 0.80, softCap: 320.0 },
      { userId, name: "Dining", monthlyCap: 250.0, currentSpent: 0.0, color: "#3b82f6", alertThreshold: 0.80, softCap: 200.0 },
      { userId, name: "Shopping", monthlyCap: 300.0, currentSpent: 0.0, color: "#ec4899", alertThreshold: 0.80, softCap: 240.0 },
      { userId, name: "Entertainment", monthlyCap: 200.0, currentSpent: 0.0, color: "#8b5cf6", alertThreshold: 0.80, softCap: 160.0 },
      { userId, name: "Travel", monthlyCap: 600.0, currentSpent: 0.0, color: "#f59e0b", alertThreshold: 0.80, softCap: 480.0 },
    ],
  });
}

/**
 * Extracts and verifies the authenticated user from the request session cookie.
 */
export async function getAuthenticatedUser(
  req: NextRequest
): Promise<{ id: string; email: string; name: string | null; persona: string } | null> {
  const cookie = req.cookies.get("pocketmate_user")?.value;
  const verified = verifySessionCookie(cookie);

  if (!verified?.email) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: verified.email },
      select: {
        id: true,
        email: true,
        name: true,
        persona: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      persona: user.persona,
    };
  } catch (error) {
    console.error("[Session Auth Error]", error);
    return null;
  }
}

/**
 * Helper to retrieve active authenticated user ID.
 * Returns null if not authenticated.
 */
export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const authUser = await getAuthenticatedUser(req);
  return authUser ? authUser.id : null;
}
