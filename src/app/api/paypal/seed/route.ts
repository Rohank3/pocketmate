import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";

export async function POST(req: NextRequest) {
  try {
    const userCookie = req.cookies.get("pocketmate_user")?.value;
    let currentUser: { id?: string; email?: string; name?: string } | null = null;
    if (userCookie) {
      try {
        currentUser = JSON.parse(userCookie);
      } catch {
        // ignore
      }
    }

    const rawTxs = await paypalClient.seedSandboxData(
      currentUser ? { name: currentUser.name, email: currentUser.email } : undefined
    );

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
