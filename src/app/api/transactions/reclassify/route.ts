import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import {
  reclassifyTransactionWithScope,
  loadUserCategorizationContext,
  categorizeTransactionsBatch,
  ReclassifyScope,
} from "@/lib/services/categorizer";
import { z } from "zod";

const ReclassifyRequestSchema = z.object({
  transactionId: z.string().trim().min(1).max(100),
  merchantName: z.string().trim().min(1).max(100),
  targetCategory: z.string().trim().min(1).max(50),
  scope: z.enum(["single", "merchant", "similar"] as const),
  allTransactions: z
    .array(
      z.object({
        id: z.string(),
        merchantName: z.string(),
        amount: z.number(),
      })
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);

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

    const { transactionId, merchantName, targetCategory, scope, allTransactions = [] } = parseResult.data;

    const result = await reclassifyTransactionWithScope({
      userId,
      transactionId,
      merchantName,
      targetCategory,
      scope: scope as ReclassifyScope,
      allTransactions,
    });

    // Dynamically evaluate the next unclassified transaction with Gemini AI
    const updatedIdsSet = new Set(result.updatedTransactionIds);
    const remaining = allTransactions.filter((t) => !updatedIdsSet.has(t.id));

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
        const catContext = await loadUserCategorizationContext(userId);
        const aiResults = await categorizeTransactionsBatch(
          [{ id: nextTx.id, merchantName: nextTx.merchantName, amount: nextTx.amount }],
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

    return NextResponse.json({
      success: true,
      ...result,
      nextSuggestion,
    });
  } catch (error) {
    console.error("[Transactions Reclassify Route Error]", error);
    return NextResponse.json(
      { error: "Failed to reclassify transaction" },
      { status: 500 }
    );
  }
}
