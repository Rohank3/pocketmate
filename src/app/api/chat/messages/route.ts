import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { markChatActionCardsResolved, parseToolCallsRecord } from "@/lib/agent/dbSync";
import { normalizeMerchant } from "@/lib/services/categorizer";
import { z } from "zod";

const PatchMessageCardSchema = z.object({
  messageId: z.string().trim().min(1).max(100),
  actionCardPatch: z.object({
    resolvedStatus: z.string().trim().min(1).max(60),
    resolvedAction: z.string().trim().max(60).optional(),
    resolvedMessage: z.string().trim().max(500).optional(),
    resolvedCategory: z.string().trim().max(100).optional(),
    resolvedReason: z.string().trim().max(500).optional(),
  }),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: true, messages: [] });
    }

    const threadId = req.nextUrl.searchParams.get("threadId");
    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json({ error: "Valid threadId is required" }, { status: 400 });
    }

    // Verify ownership
    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, userId: user.id },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found or access denied" }, { status: 404 });
    }

    // Fetch up to the last 30 messages (ordered chronologically)
    const rawMessages = await prisma.chatMessage.findMany({
      where: { threadId, userId: user.id },
      take: 30,
      orderBy: { createdAt: "desc" },
    });

    const parsedEntries = rawMessages.reverse().map((m) => {
      const parsedToolCalls = parseToolCallsRecord(m.toolCallsJson);
      const rawCard =
        parsedToolCalls?.actionCard && typeof parsedToolCalls.actionCard === "object"
          ? ({ ...(parsedToolCalls.actionCard as Record<string, unknown>) } as Record<string, unknown>)
          : parsedToolCalls && typeof parsedToolCalls.action === "string"
          ? ({ ...parsedToolCalls } as Record<string, unknown>)
          : undefined;
      return {
        msg: m,
        parsedToolCalls,
        actionCard: rawCard,
      };
    });

    // Collect unresolved actionCards to reconcile against live database state
    const unresolvedCards = parsedEntries.filter(
      (e) => e.actionCard && !e.actionCard.resolvedStatus
    );

    if (unresolvedCards.length > 0) {
      const invoiceIds = new Set<string>();
      const splitItemIds = new Set<string>();
      const txIds = new Set<string>();
      let hasTriageCard = false;
      let hasSplitDispatchCard = false;

      for (const { actionCard: card } of unresolvedCards) {
        if (!card) continue;
        if (typeof card.invoiceId === "string" && card.invoiceId.trim()) {
          invoiceIds.add(card.invoiceId.trim());
        }
        if (typeof card.splitItemId === "string" && card.splitItemId.trim()) {
          splitItemIds.add(card.splitItemId.trim());
        }
        if (card.action === "CATEGORY_TRIAGE" || card.type === "category_triage") {
          hasTriageCard = true;
          if (typeof card.transactionId === "string" && card.transactionId.trim()) {
            txIds.add(card.transactionId.trim());
          }
        }
        if (
          card.action === "PROPOSE_SPLIT_BREAKDOWN" ||
          card.type === "split_breakdown" ||
          card.action === "DISPATCH_INVOICES"
        ) {
          hasSplitDispatchCard = true;
        }
      }

      const [ledgerRows, splitItemRows, overrideRows, ruleRows, splitRecordRows] = await Promise.all([
        invoiceIds.size > 0
          ? prisma.ledgerTransaction.findMany({
              where: { userId: user.id, paypalId: { in: Array.from(invoiceIds) } },
              select: { paypalId: true, status: true },
            })
          : Promise.resolve([]),
        invoiceIds.size > 0 || splitItemIds.size > 0
          ? prisma.splitItem.findMany({
              where: {
                OR: [
                  ...(invoiceIds.size > 0 ? [{ paypalInvoiceId: { in: Array.from(invoiceIds) } }] : []),
                  ...(splitItemIds.size > 0 ? [{ id: { in: Array.from(splitItemIds) } }] : []),
                ],
              },
              select: { id: true, paypalInvoiceId: true, status: true },
            })
          : Promise.resolve([]),
        hasTriageCard && txIds.size > 0
          ? prisma.transactionCategoryOverride.findMany({
              where: { userId: user.id, transactionId: { in: Array.from(txIds) } },
              select: { transactionId: true, categoryName: true, updatedAt: true },
            })
          : Promise.resolve([]),
        hasTriageCard
          ? prisma.merchantCategoryRule.findMany({
              where: { userId: user.id },
              select: { merchantPattern: true, categoryName: true, updatedAt: true },
            })
          : Promise.resolve([]),
        hasSplitDispatchCard
          ? prisma.splitRecord.findMany({
              where: { userId: user.id },
              take: 25,
              orderBy: { createdAt: "desc" },
              include: {
                items: {
                  select: { participantEmail: true, amount: true, status: true },
                },
              },
            })
          : Promise.resolve([]),
      ]);

      const ledgerById = new Map(ledgerRows.map((r) => [r.paypalId, r.status]));
      const splitByInvoiceId = new Map(
        splitItemRows.filter((s) => s.paypalInvoiceId).map((s) => [s.paypalInvoiceId as string, s.status])
      );
      const splitByItemId = new Map(splitItemRows.map((s) => [s.id, s.status]));
      const overrideByTxId = new Map(overrideRows.map((o) => [o.transactionId, o]));
      const ruleByPattern = new Map(ruleRows.map((r) => [r.merchantPattern.toLowerCase(), r]));

      for (const entry of unresolvedCards) {
        const card = entry.actionCard;
        if (!card) continue;

        if (card.action === "REVIEW_INCOMING_INVOICE" || card.type === "incoming_invoice_review") {
          const invId = typeof card.invoiceId === "string" ? card.invoiceId.trim() : "";
          const ledgerStatus = invId ? ledgerById.get(invId) : undefined;
          const splitStatus = invId ? splitByInvoiceId.get(invId) : undefined;
          if (ledgerStatus === "COMPLETED" || splitStatus === "PAID") {
            card.resolvedStatus = "paid";
            card.resolvedAction = "pay";
            card.resolvedMessage = "Invoice settled in full via PayPal.";
          } else if (ledgerStatus === "CANCELLED" || splitStatus === "CANCELLED") {
            card.resolvedStatus = "declined";
            card.resolvedAction = "decline";
            card.resolvedMessage = "Invoice was declined.";
          }
        } else if (card.action === "CATEGORY_TRIAGE" || card.type === "category_triage") {
          const txId = typeof card.transactionId === "string" ? card.transactionId.trim() : "";
          const merchantRaw = String(card.merchantName || card.merchant || "");
          const norm = merchantRaw ? normalizeMerchant(merchantRaw) : "";
          const ov = txId ? overrideByTxId.get(txId) : undefined;
          const directRule = norm ? ruleByPattern.get(norm) : undefined;
          const matchedRule =
            directRule ||
            ruleRows.find(
              (r) => norm && (norm.includes(r.merchantPattern.toLowerCase()) || r.merchantPattern.toLowerCase().includes(norm))
            );

          if (ov && ov.updatedAt >= entry.msg.createdAt) {
            card.resolvedStatus = "categorized";
            card.resolvedCategory = ov.categoryName;
            card.resolvedMessage = `Categorized as '${ov.categoryName}'.`;
          } else if (matchedRule && matchedRule.updatedAt >= entry.msg.createdAt) {
            card.resolvedStatus = "categorized";
            card.resolvedCategory = matchedRule.categoryName;
            card.resolvedMessage = `Categorized as '${matchedRule.categoryName}'.`;
          }
        } else if (
          card.action === "PROPOSE_SPLIT_BREAKDOWN" ||
          card.type === "split_breakdown" ||
          card.action === "DISPATCH_INVOICES"
        ) {
          const msgTime = entry.msg.createdAt.getTime();
          const cardRecipients = Array.isArray(card.recipients)
            ? (card.recipients as Array<Record<string, unknown>>)
            : [];
          const cardMerchant = String(card.merchant || card.merchantName || "").toLowerCase();

          const matchedSplit = splitRecordRows.find((sr) => {
            if (sr.createdAt.getTime() < msgTime - 10_000) return false;
            const descMatch =
              cardMerchant && sr.description.toLowerCase().includes(cardMerchant.slice(0, 12));
            const amountMatch =
              cardRecipients.length > 0 &&
              cardRecipients.some((cr) =>
                sr.items.some((si) => Math.abs(si.amount - Number(cr.amount || 0)) < 0.02)
              );
            return descMatch || amountMatch;
          });

          if (matchedSplit) {
            card.resolvedStatus = "dispatched";
            card.resolvedMessage = `${matchedSplit.items.length} PayPal invoice(s) already dispatched.`;
          }
        } else if (card.action === "DISPUTE_RESOLUTION" || card.type === "dispute_resolution") {
          const spItemStatus =
            (typeof card.splitItemId === "string" && splitByItemId.get(card.splitItemId)) ||
            (typeof card.invoiceId === "string" && splitByInvoiceId.get(card.invoiceId));
          if (spItemStatus === "PAID" || spItemStatus === "SENT") {
            card.resolvedStatus = spItemStatus === "PAID" ? "accepted" : "requested_difference";
            card.resolvedMessage =
              spItemStatus === "PAID"
                ? "Split item settled."
                : "Revised PayPal invoice has been sent.";
          }
        }
      }
    }

    const messages = parsedEntries.map(({ msg: m, parsedToolCalls, actionCard }) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      actionCard: actionCard || undefined,
      toolBadges: Array.isArray(parsedToolCalls?.toolBadges)
        ? (parsedToolCalls.toolBadges as string[])
        : undefined,
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, messages });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest?: string }).digest);
      if (digest.startsWith("NEXT_PRERENDER")) {
        throw error;
      }
    }
    console.error("[Chat Messages GET Error]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = PatchMessageCardSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    await markChatActionCardsResolved({
      userId: user.id,
      messageId: parsed.data.messageId,
      resolution: parsed.data.actionCardPatch,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Chat Messages PATCH Error]", error);
    return NextResponse.json({ error: "Failed to update message card state." }, { status: 500 });
  }
}
