import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { resolvePublicOrigin } from "@/lib/paypal/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const origin = resolvePublicOrigin(req);
  try {
    const merchantIdInPayPal = req.nextUrl.searchParams.get("merchantIdInPayPal")?.trim() || "";
    const trackingId = req.nextUrl.searchParams.get("merchantId")?.trim() || "";
    const permissionsGranted = req.nextUrl.searchParams.get("permissionsGranted");
    const consentStatus = req.nextUrl.searchParams.get("consentStatus");

    const authUser = await getAuthenticatedUser(req);
    let targetUserId = authUser?.id || null;

    if (!targetUserId && trackingId) {
      const trackedUser = await prisma.user.findFirst({
        where: { paypalPartnerTrackingId: trackingId },
        select: { id: true },
      });
      targetUserId = trackedUser?.id || null;
    }

    if (!targetUserId || !merchantIdInPayPal || permissionsGranted === "false" || consentStatus === "false") {
      return NextResponse.redirect(`${origin}/?paypal_onboarded=declined`);
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        paypalMerchantId: merchantIdInPayPal,
        paypalOnboardingStatus: "CONNECTED",
        lastSyncedAt: null,
      },
    });

    return NextResponse.redirect(`${origin}/?paypal_onboarded=true`);
  } catch (err) {
    console.error("[PayPal Onboard Callback Error]", err);
    return NextResponse.redirect(`${origin}/?paypal_onboarded=error`);
  }
}
