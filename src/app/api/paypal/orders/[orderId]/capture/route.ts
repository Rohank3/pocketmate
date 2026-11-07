import { NextRequest, NextResponse } from "next/server";
import { paypalClient } from "@/lib/paypal/client";
import { getAuthenticatedUser } from "@/lib/auth/session";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required to capture order." },
        { status: 401 }
      );
    }

    const { orderId } = await context.params;
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const captureResult = await paypalClient.captureOrder(orderId);

    return NextResponse.json({
      success: true,
      capture: captureResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to capture PayPal order";
    console.error("[PayPal Orders Capture Error]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
