import { NextRequest, NextResponse } from "next/server";
import { exchangePayPalCodeForTokens, fetchPayPalUserInfo } from "@/lib/paypal/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    if (!code) {
      return NextResponse.redirect(`${appUrl}/?auth_error=missing_code`);
    }

    // Exchange auth code for user access token
    const { accessToken } = await exchangePayPalCodeForTokens(code);

    // Fetch user profile from PayPal OpenID Connect endpoint
    const profile = await fetchPayPalUserInfo(accessToken);

    // Upsert user into live Neon PostgreSQL database
    const user = await prisma.user.upsert({
      where: { email: profile.email },
      update: {
        name: profile.name,
      },
      create: {
        email: profile.email,
        name: profile.name,
        persona: "GENERAL",
      },
    });

    // Ensure default budget categories exist for this user in DB
    const catCount = await prisma.budgetCategory.count({ where: { userId: user.id } });
    if (catCount === 0) {
      await prisma.budgetCategory.createMany({
        data: [
          { userId: user.id, name: "Groceries", monthlyCap: 400.0, currentSpent: 0.0, color: "#10b981" },
          { userId: user.id, name: "Dining", monthlyCap: 250.0, currentSpent: 0.0, color: "#3b82f6" },
          { userId: user.id, name: "Shopping", monthlyCap: 300.0, currentSpent: 0.0, color: "#ec4899" },
          { userId: user.id, name: "Entertainment", monthlyCap: 200.0, currentSpent: 0.0, color: "#8b5cf6" },
        ],
      });
    }

    // Ensure starter upcoming bills exist for the scheduler in DB
    const eventCount = await prisma.scheduledEvent.count({ where: { userId: user.id } });
    if (eventCount === 0) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");

      await prisma.scheduledEvent.createMany({
        data: [
          {
            userId: user.id,
            title: "Cloud Infrastructure (AWS / Cloudflare)",
            amount: 95.0,
            date: `${year}-${month}-12`,
            dayOfMonth: 12,
            type: "outgoing",
            category: "Utilities",
            counterparty: "AWS",
            status: "scheduled",
          },
          {
            userId: user.id,
            title: "Streaming & Entertainment Subscriptions",
            amount: 24.99,
            date: `${year}-${month}-18`,
            dayOfMonth: 18,
            type: "outgoing",
            category: "Entertainment",
            counterparty: "Digital Services",
            status: "scheduled",
          },
        ],
      });
    }

    const redirectRes = NextResponse.redirect(
      `${appUrl}/?connected=paypal&userName=${encodeURIComponent(user.name || "PayPal User")}&userEmail=${encodeURIComponent(
        user.email
      )}`
    );

    // Set user session cookie (readable on client & server)
    redirectRes.cookies.set(
      "pocketmate_user",
      JSON.stringify({ id: user.id, email: user.email, name: user.name }),
      {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
      }
    );

    return redirectRes;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[PayPal Auth Callback Error]", error);
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}/?auth_error=exchange_failed`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, name } = (await req.json()) as { email?: string; name?: string };
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name?.trim() || cleanEmail.split("@")[0].replace(/[._]/g, " ");

    const user = await prisma.user.upsert({
      where: { email: cleanEmail },
      update: { name: cleanName },
      create: {
        email: cleanEmail,
        name: cleanName,
        persona: "GENERAL",
      },
    });

    // Ensure default budget categories exist
    const catCount = await prisma.budgetCategory.count({ where: { userId: user.id } });
    if (catCount === 0) {
      await prisma.budgetCategory.createMany({
        data: [
          { userId: user.id, name: "Groceries", monthlyCap: 400.0, currentSpent: 0.0, color: "#10b981" },
          { userId: user.id, name: "Dining", monthlyCap: 250.0, currentSpent: 0.0, color: "#3b82f6" },
          { userId: user.id, name: "Shopping", monthlyCap: 300.0, currentSpent: 0.0, color: "#ec4899" },
          { userId: user.id, name: "Entertainment", monthlyCap: 200.0, currentSpent: 0.0, color: "#8b5cf6" },
        ],
      });
    }

    const res = NextResponse.json({ success: true, user });
    res.cookies.set(
      "pocketmate_user",
      JSON.stringify({ id: user.id, email: user.email, name: user.name }),
      {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      }
    );
    return res;
  } catch (error) {
    console.error("[Sandbox Manual Login Error]", error);
    return NextResponse.json({ error: "Failed to authenticate sandbox user" }, { status: 500 });
  }
}
