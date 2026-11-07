import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { verifySessionCookie } from "@/lib/auth/session";

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

    const sanitizedUser =
      verified && typeof verified.email === "string" && verified.email.includes("@")
        ? {
            name: typeof verified.name === "string" ? verified.name.trim().slice(0, 100) : undefined,
            email: verified.email.trim().toLowerCase().slice(0, 255),
          }
        : undefined;

    const rawTxs = await paypalClient.seedSandboxData(sanitizedUser);

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
      message: "Successfully seeded live PayPal Sandbox transactions and invoices.",
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
