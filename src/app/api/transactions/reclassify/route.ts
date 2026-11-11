import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import {
  reclassifyTransactionWithScope,
  loadUserCategorizationContext,
  categorizeTransactionsBatch,
  normalizeMerchant,
  ReclassifyScope,
} from "@/lib/services/categorizer";
import { markChatActionCardsResolved, persistChatMessage } from "@/lib/agent/dbSync";
import { z } from "zod";

const ReclassifyRequestSchema = z.object({
  transactionId: z.string().trim().min(1).max(100),
  merchantName: z.string().trim().min(1).max(100),
  targetCategory: z.string().trim().min(1).max(50),
  scope: z.enum(["single", "merchant", "similar"] as const),
  messageId: z.string().trim().max(100).optional(),
  threadId: z.string().trim().max(100).optional(),
  allTransactions: z
    .array(
      z.object({
        id: z.string(),
        merchantName: z.string(),
        memo: z.string().optional(),
        amount: z.number(),
        category: z.string().optional(),
      })
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Active session required." }, { status: 401 });
    }

    const rawBody = await req.json();
    const parseResult = ReclassifyRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const {
      transactionId,
      merchantName,
      targetCategory,
      scope,
      messageId,
      threadId,
      allTransactions = [],
    } = parseResult.data;

    const result = await reclassifyTransactionWithScope({
      userId,
      transactionId,
      merchantName,
      targetCategory,
      scope: scope as ReclassifyScope,
      allTransactions,
    });

    const resolvedCardIdsSet = new Set(result.updatedTransactionIds);
    const merchantLower = merchantName.toLowerCase().trim();
    await markChatActionCardsResolved({
      userId,
      messageId,
      match: (card) => {
        if (card.action !== "CATEGORY_TRIAGE" && card.type !== "category_triage") return false;
        const cardTxId = typeof card.transactionId === "string" ? card.transactionId : "";
        const cardMerchant = String(card.merchantName || card.merchant || "").toLowerCase().trim();
        return (
          cardTxId === transactionId ||
          resolvedCardIdsSet.has(cardTxId) ||
          (scope !== "single" && cardMerchant === merchantLower)
        );
      },
      resolution: {
        resolvedStatus: "categorized",
        resolvedCategory: targetCategory,
        resolvedMessage: result.message || `Categorized as '${targetCategory}'.`,
      },
    });

    // Load fresh categorization context including updated rules and overrides
    const catContext = await loadUserCategorizationContext(userId);
    const updatedIdsSet = new Set(result.updatedTransactionIds);
    const overrideMap = new Map(catContext.overrides?.map((o) => [o.transactionId, o.categoryName]) || []);
    const ruleMap = new Map(
      catContext.merchantRules?.map((r) => [r.merchantPattern.toLowerCase(), r.categoryName]) || []
    );

    // Filter strictly for GENUINELY unclassified transactions (never repeat already-decided items)
    const remaining = allTransactions.filter((t) => {
      if (updatedIdsSet.has(t.id)) return false;
      if (overrideMap.has(t.id)) return false;
      const norm = normalizeMerchant(t.merchantName);
      if (ruleMap.has(norm)) return false;
      for (const [pattern] of ruleMap.entries()) {
        if (norm.includes(pattern) || pattern.includes(norm)) return false;
      }
      if (t.category && t.category.toLowerCase() !== "uncategorized" && t.category !== "—") {
        return false;
      }
      return true;
    });

    let nextSuggestion: {
      transactionId: string;
      merchantName: string;
      amount: number;
      suggestedCategory: string;
      confidence: number;
      reasoning: string;
      remainingCount: number;
    } | null = null;

    if (remaining.length > 0) {
      const nextTx = remaining[0];
      try {
        const aiResults = await categorizeTransactionsBatch(
          [{ id: nextTx.id, merchantName: nextTx.merchantName, amount: nextTx.amount, note: nextTx.memo }],
          catContext
        );
        const aiItem = aiResults.get(nextTx.id);

        nextSuggestion = {
          transactionId: nextTx.id,
          merchantName: nextTx.merchantName,
          amount: nextTx.amount,
          suggestedCategory:
            aiItem?.suggestedCategory ||
            (aiItem?.category && aiItem.category !== "Uncategorized"
              ? aiItem.category
              : catContext.activeCategories?.[0]?.name || "Uncategorized"),
          confidence: aiItem?.confidence ?? 0,
          reasoning: aiItem?.reasoning || "",
          remainingCount: remaining.length,
        };
      } catch (aiErr) {
        console.warn("[Reclassify Next Suggestion Error]", aiErr);
        nextSuggestion = {
          transactionId: nextTx.id,
          merchantName: nextTx.merchantName,
          amount: nextTx.amount,
          suggestedCategory: "Uncategorized",
          confidence: 0,
          reasoning: "",
          remainingCount: remaining.length,
        };
      }
    }

    let persistedFollowUpId: string | undefined = undefined;
    if (threadId && messageId) {
      const warningNotice = result.warning ? `\n\n⚠️ ${result.warning}` : "";
      if (nextSuggestion) {
        persistedFollowUpId = await persistChatMessage(
          "assistant",
          `Reclassified **${merchantName}** as *${targetCategory}*.${warningNotice} **${nextSuggestion.remainingCount} unclassified transaction(s) remaining** in your ledger. Next up: **${nextSuggestion.merchantName}** ($${nextSuggestion.amount.toFixed(2)}).`,
          "GENERAL",
          {
            actionCard: {
              action: "CATEGORY_TRIAGE",
              type: "category_triage",
              transactionId: nextSuggestion.transactionId,
              merchantName: nextSuggestion.merchantName,
              amount: nextSuggestion.amount,
              suggestedCategory: nextSuggestion.suggestedCategory,
              confidence: nextSuggestion.confidence,
              reasoning: nextSuggestion.reasoning,
            },
          },
          userId,
          threadId
        );
      } else {
        persistedFollowUpId = await persistChatMessage(
          "assistant",
          `🎉 **All transactions classified!** Every item in your ledger has been categorized and your budget spending caps are up to date.${warningNotice}`,
          "GENERAL",
          undefined,
          userId,
          threadId
        );
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      nextSuggestion,
      persistedFollowUpId,
    });
  } catch (error) {
    console.error("[Transactions Reclassify Route Error]", error);
    return NextResponse.json(
      { error: "Failed to reclassify transaction" },
      { status: 500 }
    );
  }
}
