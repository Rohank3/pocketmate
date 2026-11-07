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

  const jsonStr = JSON.stringify(payload);
  const base64Payload = Buffer.from(jsonStr).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(base64Payload)
    .digest("base64url");

  return `${base64Payload}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed session cookie payload.
 * Also supports graceful fallback for legacy unsigned JSON in local sandbox environments.
 */
export function verifySessionCookie(cookieValue?: string): SessionPayload | null {
  if (!cookieValue || typeof cookieValue !== "string" || !cookieValue.includes(".")) {
    return null;
  }

  // Strictly require signed cookie format: <base64url>.<signature>
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
      signature.length === expectedSig.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
    ) {
      const jsonStr = Buffer.from(base64Payload, "base64url").toString("utf-8");
      const parsed = JSON.parse(jsonStr) as SessionPayload;
      const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (
        parsed &&
        typeof parsed.email === "string" &&
        parsed.email.includes("@") &&
        typeof parsed.issuedAt === "number" &&
        Date.now() - parsed.issuedAt <= MAX_SESSION_AGE_MS &&
        parsed.issuedAt <= Date.now() + 60000
      ) {
        return parsed;
      }
    }
  } catch {
    return null;
  }

  return null;
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
 * Helper to retrieve active user ID, creating a demo user if in local demo mode.
 */
export async function getUserIdFromRequest(req: NextRequest): Promise<string> {
  const authUser = await getAuthenticatedUser(req);
  if (authUser) {
    return authUser.id;
  }

  // Demo user fallback
  const defaultUser = await prisma.user.upsert({
    where: { email: "demo@pocketmate.ai" },
    update: {},
    create: { email: "demo@pocketmate.ai", name: "PocketMate User", persona: "GENERAL" },
  });
  return defaultUser.id;
}
