import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { paypalClient } from "@/lib/paypal/client";
import { resolvePublicOrigin } from "@/lib/paypal/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Active PayPal session required." },
        { status: 401 }
      );
    }

    const origin = resolvePublicOrigin(req);
    const trackingId = `pm_${authUser.id}_${Date.now()}`;
    const returnUrl = `${origin}/api/auth/paypal/onboard/callback`;

    const referral = await paypalClient.createPartnerReferral({
      trackingId,
      returnUrl,
    });

    await prisma.user.update({
      where: { id: authUser.id },
      data: {
        paypalPartnerTrackingId: trackingId,
        paypalOnboardingStatus: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      actionUrl: referral.actionUrl,
      trackingId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to initiate PayPal Partner onboarding.";
    console.error("[PayPal Onboard POST Error]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
