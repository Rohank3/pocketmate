import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { verifySessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { reconcileAutopaySubscriptions } from "@/lib/services/autopayReconciliation";

let lastSeedTimestamp = 0;

export async function POST(req: NextRequest) {
  try {
    if (process.env.PAYPAL_ENVIRONMENT === "live") {
      return NextResponse.json(
        { error: "Sandbox seeding is disabled in production live environment." },
        { status: 403 }
      );
    }

    const now = Date.now();
    if (now - lastSeedTimestamp < 10000) {
      return NextResponse.json(
        { error: "Please wait 10 seconds before reseeding sandbox data." },
        { status: 429 }
      );
    }
    lastSeedTimestamp = now;

    const userCookie = req.cookies.get("pocketmate_user")?.value;
    const verified = verifySessionCookie(userCookie);

    if (!verified || !verified.email) {
      return NextResponse.json(
        { error: "Please log in with PayPal to synchronize and initialize your sandbox activity." },
        { status: 401 }
      );
    }

    const rawTxs = await paypalClient.syncUserTransactions(verified.email);

    // Reconcile and auto-detect recurring bills from fresh transaction activity
    const user = await prisma.user.findUnique({ where: { email: verified.email } });
    if (user) {
      await reconcileAutopaySubscriptions(user.id, verified.email);
    }

    // Map to TransactionRow format expected by the frontend
    const formatted = rawTxs.map((t) => {
      const dateObj = new Date(t.timestamp);
      const isToday = new Date().toDateString() === dateObj.toDateString();
      const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const displayDate = isToday ? `Today, ${timeStr}` : `${dateObj.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;

      let category = "General";
      const m = t.merchantName.toLowerCase();
      if (m.includes("bar") || m.includes("diner") || m.includes("coffee") || m.includes("bistro") || m.includes("dining")) {
        category = "Dining";
      } else if (m.includes("lane") || m.includes("bowling") || m.includes("movie") || m.includes("entertainment")) {
        category = "Entertainment";
      } else if (m.includes("zara") || m.includes("mall") || m.includes("shopping")) {
        category = "Shopping";
      } else if (m.includes("target") || m.includes("grocer") || m.includes("market") || m.includes("food")) {
        category = "Groceries";
      }

      let rowStatus: "settled" | "pending" | "disputed" | "unresolved" = "pending";
      if (t.status === "COMPLETED") rowStatus = "settled";
      else if (t.status === "PENDING" || t.status === "DRAFT") rowStatus = "pending";

      return {
        id: t.id,
        date: displayDate,
        merchant: t.merchantName,
        category,
        debtor_name: t.debtorName || "Self",
        amount: t.amount,
        status: rowStatus,
      };
    });

    return NextResponse.json({
      success: true,
      message: "Successfully synchronized live PayPal Sandbox transactions.",
      transactions: formatted,
    });
  } catch (error) {
    console.error("[PayPal Seed Error]", error);
    return NextResponse.json(
      { success: false, error: "Failed to seed PayPal sandbox transactions" },
      { status: 500 }
    );
  }
}
