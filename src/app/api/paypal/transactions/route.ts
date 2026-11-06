import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";

export async function GET(req: NextRequest) {
  try {
    const hoursBackParam = req.nextUrl.searchParams.get("hoursBack");
    const hoursBack = hoursBackParam ? parseFloat(hoursBackParam) : 720; // default 30 days

    const txs = await paypalClient.fetchRecentTransactions(hoursBack);

    // Map to TransactionRow format expected by the frontend
    const formatted = txs.map((t) => {
      const dateObj = new Date(t.timestamp);
      const isToday = new Date().toDateString() === dateObj.toDateString();
      const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const displayDate = isToday ? `Today, ${timeStr}` : `${dateObj.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;

      // Infer clean category
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
      } else if (m.includes("transit") || m.includes("metro") || m.includes("flight") || m.includes("travel")) {
        category = "Travel";
      }

      let rowStatus: "settled" | "pending" | "disputed" | "unresolved" = "pending";
      if (t.status === "COMPLETED") rowStatus = "settled";
      else if (t.status === "PENDING" || t.status === "DRAFT") rowStatus = "pending";
      else if (t.status === "DISPUTED") rowStatus = "disputed";

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
      count: formatted.length,
      transactions: formatted,
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[PayPal Transactions Route Error]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch PayPal transactions", transactions: [] },
      { status: 500 }
    );
  }
}
