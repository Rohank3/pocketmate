import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, getUserIdFromRequest } from "@/lib/auth/session";
import { normalizeMerchant } from "@/lib/services/categorizer";
import { z } from "zod";

const UpdateCategoryPayloadSchema = z.object({
  transactionId: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  rememberForMerchant: z.boolean().default(false).optional(),
  merchantName: z.string().trim().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : await getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parseResult = UpdateCategoryPayloadSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { transactionId, category, rememberForMerchant, merchantName } = parseResult.data;

    // Save individual transaction override
    const override = await prisma.transactionCategoryOverride.upsert({
      where: {
        userId_transactionId: {
          userId,
          transactionId,
        },
      },
      update: { categoryName: category },
      create: {
        userId,
        transactionId,
        categoryName: category,
      },
    });

    let rule = null;
    if (rememberForMerchant && merchantName) {
      const norm = normalizeMerchant(merchantName);
      if (norm.length >= 2) {
        rule = await prisma.merchantCategoryRule.upsert({
          where: {
            userId_merchantPattern: {
              userId,
              merchantPattern: norm,
            },
          },
          update: {
            categoryName: category,
            isAutoLearned: false,
          },
          create: {
            userId,
            merchantPattern: norm,
            categoryName: category,
            isAutoLearned: false,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      override,
      rule,
      message: `Transaction categorized as '${category}'${
        rule ? ` and saved persistent rule for '${merchantName}'` : ""
      }.`,
    });
  } catch (error) {
    console.error("[Transaction Category Update Error]", error);
    return NextResponse.json({ error: "Failed to update transaction category" }, { status: 500 });
  }
}
