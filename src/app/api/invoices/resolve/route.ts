import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { z } from "zod";

const InvoiceResolutionSchema = z.object({
  invoiceId: z.string().trim().min(1).max(100),
  splitItemId: z.string().trim().optional(),
  action: z.enum(["pay", "pay_adjusted", "decline"]),
  adjustedAmount: z.number().finite().positive().max(500000).optional(),
  reason: z.string().trim().max(1000).optional(),
  originalAmount: z.number().finite().positive().max(500000).optional(),
  memo: z.string().trim().max(255).optional(),
  senderName: z.string().trim().max(100).optional(),
  senderEmail: z.string().trim().email().max(255).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: Active session required." },
        { status: 401 }
      );
    }

    const rawBody = await req.json();
    const parseResult = InvoiceResolutionSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const {
      invoiceId,
      splitItemId,
      action,
      adjustedAmount,
      reason,
      originalAmount = 0,
      memo = "Split invoice",
      senderName = "Organizer",
      senderEmail,
    } = parseResult.data;

    const payerName = authUser?.name || authUser?.email?.split("@")[0] || "Mark Spencer";
    const payerEmail = authUser?.email || "mark.spencer.pm@personal.example.com";

    // 1. Locate SplitItem in PostgreSQL if linked
    let splitItem = null;
    if (splitItemId) {
      splitItem = await prisma.splitItem.findUnique({
        where: { id: splitItemId },
        include: {
          splitRecord: {
            include: {
              user: true,
            },
          },
        },
      });
    }

    if (!splitItem) {
      splitItem = await prisma.splitItem.findFirst({
        where: {
          OR: [
            { paypalInvoiceId: invoiceId },
            { id: invoiceId },
            { participantEmail: payerEmail },
          ],
        },
        include: {
          splitRecord: {
            include: {
              user: true,
            },
          },
        },
      });
    }

    // 2. Update SplitItem status in DB
    if (splitItem) {
      let newStatus: "PAID" | "CANCELLED" = "PAID";
      if (action === "decline") {
        newStatus = "CANCELLED";
      }

      await prisma.splitItem.update({
        where: { id: splitItem.id },
        data: {
          status: newStatus,
          amount: action === "pay_adjusted" && adjustedAmount ? adjustedAmount : splitItem.amount,
        },
      });

      // Update SplitRecord if all items are settled
      const remainingUnpaid = await prisma.splitItem.count({
        where: {
          splitRecordId: splitItem.splitRecordId,
          status: { in: ["DRAFT", "SENT"] },
        },
      });

      if (remainingUnpaid === 0) {
        await prisma.splitRecord.update({
          where: { id: splitItem.splitRecordId },
          data: { status: "SETTLED" },
        });
      }
    }

    // 3. Construct high-visibility resolution notification message for the organizer
    const effectiveDescription = splitItem?.splitRecord?.description || memo;
    const effectiveOriginal = splitItem?.amount || originalAmount || 0;
    let notificationContent = "";

    if (action === "pay") {
      notificationContent = `🎉 **${payerName}** settled their **$${effectiveOriginal.toFixed(
        2
      )}** invoice for **"${effectiveDescription}"** in full via PayPal Sandbox.\n\n• **Invoice ID**: \`${invoiceId}\`\n• **Settlement**: $${effectiveOriginal.toFixed(
        2
      )} USD\n• **Status**: Settled`;
    } else if (action === "pay_adjusted") {
      const adj = adjustedAmount || 0;
      notificationContent = `⚠️ **${payerName}** submitted an adjusted payment of **$${adj.toFixed(
        2
      )}** (originally $${effectiveOriginal.toFixed(
        2
      )}) for **"${effectiveDescription}"** via PayPal Sandbox.\n\n• **Invoice ID**: \`${invoiceId}\`\n• **Adjusted Amount**: $${adj.toFixed(
        2
      )} USD\n• **Reason Provided**: "${reason || "No explanation provided"}"\n• **Status**: Adjusted Settlement`;
    } else {
      notificationContent = `❌ **${payerName}** declined the invoice of **$${effectiveOriginal.toFixed(
        2
      )}** for **"${effectiveDescription}"**.\n\n• **Invoice ID**: \`${invoiceId}\`\n• **Reason Provided**: "${reason || "No explanation provided"}"\n• **Status**: Declined`;
    }

    // 5. Send notification message to Organizer's Chat Thread
    let organizerUserId: string | null = splitItem?.splitRecord?.userId || null;

    if (!organizerUserId && senderEmail) {
      const orgUser = await prisma.user.findUnique({
        where: { email: senderEmail },
      });
      if (orgUser) organizerUserId = orgUser.id;
    }

    // Fallback: If no organizer found, deliver to primary host (Dave Chen or senderName)
    if (!organizerUserId) {
      const targetQuery = senderName && senderName !== "Organizer" ? senderName : "Dave";
      const org = await prisma.user.findFirst({
        where: {
          OR: [
            { email: "dave.chen@business.example.com" },
            { name: { contains: targetQuery } },
          ],
        },
      });
      if (org) organizerUserId = org.id;
    }

    if (organizerUserId && organizerUserId !== userId) {
      // Find or create active thread for organizer
      let targetThread = await prisma.chatThread.findFirst({
        where: { userId: organizerUserId },
        orderBy: { updatedAt: "desc" },
      });

      if (!targetThread) {
        targetThread = await prisma.chatThread.create({
          data: {
            userId: organizerUserId,
            title: "Financial Activity & Invoicing",
          },
        });
      }

      // Insert resolution notification message directly into organizer's thread
      await prisma.chatMessage.create({
        data: {
          userId: organizerUserId,
          threadId: targetThread.id,
          role: "assistant",
          content: notificationContent,
          persona: "GENERAL",
        },
      });

      await prisma.chatThread.update({
        where: { id: targetThread.id },
        data: { updatedAt: new Date() },
      });
    }

    const paypalInvoiceUrl = `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}`;

    return NextResponse.json({
      success: true,
      action,
      invoiceId,
      paypalInvoiceUrl,
      message:
        action === "pay"
          ? `Settled invoice for $${effectiveOriginal.toFixed(2)}.`
          : action === "pay_adjusted"
          ? `Submitted adjusted payment of $${(adjustedAmount || 0).toFixed(2)}.`
          : `Declined invoice ${invoiceId}.`,
    });
  } catch (error) {
    console.error("[Invoice Resolution API Error]", error);
    return NextResponse.json(
      { error: "Internal server error resolving invoice." },
      { status: 500 }
    );
  }
}
