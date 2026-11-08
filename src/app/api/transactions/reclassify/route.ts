import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { reclassifyTransactionWithScope, ReclassifyScope } from "@/lib/services/categorizer";
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

    const { transactionId, merchantName, targetCategory, scope, allTransactions } = parseResult.data;

    const result = await reclassifyTransactionWithScope({
      userId,
      transactionId,
      merchantName,
      targetCategory,
      scope: scope as ReclassifyScope,
      allTransactions,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[Transactions Reclassify Route Error]", error);
    return NextResponse.json(
      { error: "Failed to reclassify transaction" },
      { status: 500 }
    );
  }
}
