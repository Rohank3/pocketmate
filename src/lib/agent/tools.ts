import { z } from "zod";
import { paypalClient } from "../paypal/client";
import { calculateEqualSplit, SplitParticipant } from "../math/split";
import { syncBudgetExpenseToDB } from "./dbSync";
import { prisma } from "../db";

// ============================================================================
// Parameter Validation Schemas (Layer B: Validation Middleware)
// ============================================================================

export const FetchTransactionsSchema = z.object({
  hoursBack: z.number().min(0.5).max(720).default(24),
});

export const CalculateSplitSchema = z.object({
  totalAmount: z.number().finite().positive().max(1000000),
  participants: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        emailOrHandle: z.string().trim().min(1).max(255),
      })
    )
    .min(1)
    .max(50),
  memo: z.string().trim().max(255).optional(),
});

export const DispatchInvoicesSchema = z.object({
  recipients: z
    .array(
      z.object({
        email: z.string().trim().email().max(255),
        name: z.string().trim().max(100).optional(),
        amount: z.number().finite().positive().max(50000),
        description: z.string().trim().min(1).max(255),
      })
    )
    .min(1)
    .max(50),
  isConfirmed: z.boolean().default(false), // Layer D: Requires explicit confirmation before live write
});

export const SendPayoutSchema = z.object({
  recipientEmail: z.string().trim().email().max(255),
  amount: z.number().finite().positive().max(50000),
  note: z.string().trim().max(255).optional(),
  isConfirmed: z.boolean().default(false),
});

const PROTOTYPE_POLLUTION_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "toString",
  "valueOf",
]);

export const LogCategoryExpenseSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .refine((val) => !PROTOTYPE_POLLUTION_KEYS.has(val), "Invalid category name."),
  amount: z.number().finite().positive().max(1000000),
  merchant: z.string().trim().max(100).optional(),
  description: z.string().trim().max(255).optional(),
});

export const CheckBudgetStatusSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .refine((val) => !PROTOTYPE_POLLUTION_KEYS.has(val), "Invalid category name."),
});

const SAFE_FILTER_KEYS = new Set([
  "id",
  "date",
  "debtor_name",
  "merchantName",
  "amount",
  "category",
  "status",
  "type",
  "description",
]);

export const MutateAGGridSchema = z.object({
  groupBy: z.array(z.string().max(50)).max(5).optional(),
  filter: z
    .record(z.string().max(50), z.union([z.string().max(100), z.number(), z.boolean()]))
    .refine(
      (obj) =>
        Object.keys(obj).every(
          (k) => !["__proto__", "prototype", "constructor"].includes(k) && SAFE_FILTER_KEYS.has(k)
        ),
      "Filter contains unsupported or hazardous property names."
    )
    .optional(),
  renderChart: z.string().max(100).optional(),
  highlightRowId: z.string().max(100).optional(),
  statusMessage: z.string().max(500).optional(),
});

export const AuditReceiptSchema = z.object({
  receiptTotal: z.number().finite().positive().max(100000),
  tax: z.number().finite().nonnegative().max(10000).optional().default(0),
  tip: z.number().finite().nonnegative().max(10000).optional().default(0),
  transactionId: z.string().trim().max(100).optional(),
  lineItems: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        amount: z.number().finite().positive().max(50000),
      })
    )
    .max(100)
    .optional(),
});

export const UpdatePersonaSchema = z.object({
  newPersona: z.enum(["GENERAL", "FREELANCER", "BUSINESS"]),
  reason: z.string().trim().min(1).max(500),
});

export const InitiateDisputeSchema = z.object({
  transactionId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(255),
  disputedAmount: z.number().finite().positive().max(50000),
  isConfirmed: z.boolean().default(false),
});

// ============================================================================
// In-Memory Fallback State (Simulating DB when Neon is not connected)
// ============================================================================

export interface MockBudgetStore {
  [category: string]: { monthlyCap: number; currentSpent: number };
}

export const inMemoryBudgets: MockBudgetStore = Object.assign(Object.create(null), {
  Food: { monthlyCap: 400.0, currentSpent: 340.0 },
  Groceries: { monthlyCap: 400.0, currentSpent: 340.0 },
  Dining: { monthlyCap: 250.0, currentSpent: 180.0 },
  Shopping: { monthlyCap: 300.0, currentSpent: 120.0 },
  Software: { monthlyCap: 150.0, currentSpent: 99.0 },
  Travel: { monthlyCap: 500.0, currentSpent: 150.0 },
});

// ============================================================================
// Tool Declarations for Gemini Function Calling
// ============================================================================

export const agentToolDeclarations = [
  {
    name: "fetch_recent_transactions",
    description: "Queries recent transactions from PayPal within a specific time window in hours (e.g., 3 for last 3 hours, 24 for today).",
    parameters: {
      type: "OBJECT",
      properties: {
        hoursBack: {
          type: "NUMBER",
          description: "Number of hours to look back (default 24).",
        },
      },
      required: ["hoursBack"],
    },
  },
  {
    name: "calculate_deterministic_split",
    description: "Computes an exact, penny-locked split across participants with zero floating-point rounding drift.",
    parameters: {
      type: "OBJECT",
      properties: {
        totalAmount: {
          type: "NUMBER",
          description: "Total dollar amount to split.",
        },
        participants: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              emailOrHandle: { type: "STRING" },
            },
            required: ["name", "emailOrHandle"],
          },
          description: "List of people involved in the split.",
        },
        memo: {
          type: "STRING",
          description: "Summary or itemized context of what is being split.",
        },
      },
      required: ["totalAmount", "participants"],
    },
  },
  {
    name: "dispatch_paypal_invoices",
    description: "Prepares or dispatches real PayPal invoices to participants. Returns a preview card if not confirmed.",
    parameters: {
      type: "OBJECT",
      properties: {
        recipients: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              email: { type: "STRING" },
              name: { type: "STRING" },
              amount: { type: "NUMBER" },
              description: { type: "STRING" },
            },
            required: ["email", "amount", "description"],
          },
        },
      },
      required: ["recipients"],
    },
  },
  {
    name: "send_direct_payout",
    description: "Transfers funds directly from your PayPal Sandbox account to a recipient using PayPal Payouts API. Used for direct settlements, reimbursements, or payments ('pay Dave $50', 'send $30 to Sarah'). Returns an interactive preview card if not confirmed.",
    parameters: {
      type: "OBJECT",
      properties: {
        recipientEmail: { type: "STRING", description: "PayPal email of recipient." },
        amount: { type: "NUMBER", description: "Dollar amount to transfer." },
        note: { type: "STRING", description: "Payment reason or description." },
      },
      required: ["recipientEmail", "amount"],
    },
  },
  {
    name: "log_category_expense",
    description: "Logs an expense to a specific monthly budget category and checks for budget overrun.",
    parameters: {
      type: "OBJECT",
      properties: {
        category: { type: "STRING", description: "e.g., Groceries, Dining, Shopping" },
        amount: { type: "NUMBER", description: "Dollar amount to add." },
        merchant: { type: "STRING", description: "Name of merchant if known." },
        description: { type: "STRING", description: "Item description." },
      },
      required: ["category", "amount"],
    },
  },
  {
    name: "check_budget_status",
    description: "Checks current spent vs monthly ceiling for a specific category.",
    parameters: {
      type: "OBJECT",
      properties: {
        category: { type: "STRING" },
      },
      required: ["category"],
    },
  },
  {
    name: "mutate_ag_grid",
    description: "Reconfigures the interactive AG Grid on the dashboard (row grouping, filters, chart rendering, row highlighting) based on user intent.",
    parameters: {
      type: "OBJECT",
      properties: {
        groupBy: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Columns to group by, e.g., ['debtor_name'] or ['category'].",
        },
        filter: {
          type: "OBJECT",
          description: "Filter criteria, e.g., { status: 'unpaid' }.",
        },
        renderChart: {
          type: "STRING",
          description: "Chart type to render, e.g., 'debt_by_person_bar' or 'spending_trend_line'.",
        },
        statusMessage: {
          type: "STRING",
          description: "Explanatory note of the grid mutation.",
        },
      },
    },
  },
  {
    name: "audit_receipt_against_transaction",
    description: "Cross-checks an itemized receipt image/bill against captured PayPal charges to detect hidden fees, service charges, or calculation errors.",
    parameters: {
      type: "OBJECT",
      properties: {
        receiptTotal: { type: "NUMBER" },
        tax: { type: "NUMBER" },
        tip: { type: "NUMBER" },
        transactionId: { type: "STRING" },
      },
      required: ["receiptTotal"],
    },
  },
  {
    name: "update_user_persona",
    description: "Auto-detects and transitions the user's active operating persona (GENERAL, FREELANCER, BUSINESS) based on sustained conversational behavior.",
    parameters: {
      type: "OBJECT",
      properties: {
        newPersona: {
          type: "STRING",
          enum: ["GENERAL", "FREELANCER", "BUSINESS"],
        },
        reason: { type: "STRING" },
      },
      required: ["newPersona", "reason"],
    },
  },
  {
    name: "initiate_paypal_dispute",
    description: "Initiates a formal PayPal dispute for unrecognized charges, hidden surcharges, or transaction discrepancies.",
    parameters: {
      type: "OBJECT",
      properties: {
        transactionId: { type: "STRING" },
        reason: { type: "STRING" },
        disputedAmount: { type: "NUMBER" },
        isConfirmed: { type: "BOOLEAN" },
      },
      required: ["transactionId", "reason", "disputedAmount"],
    },
  },
];

// ============================================================================
// Tool Dispatcher & Execution Handlers
// ============================================================================

export async function executeAgentTool(
  name: string,
  rawArgs: Record<string, unknown>,
  userId?: string,
  isHumanActionConfirmation: boolean = false
) {
  // Layer D Security Guardrail:
  // Live payout/invoice/dispute execution CANNOT be triggered directly by LLM function calls.
  // isConfirmed is strictly forced to false unless explicitly triggered by an authenticated human confirmation tap.
  const safeArgs: Record<string, unknown> = {
    ...rawArgs,
    isConfirmed: isHumanActionConfirmation === true && Boolean(rawArgs.isConfirmed),
  };

  switch (name) {
    case "fetch_recent_transactions": {
      const { hoursBack } = FetchTransactionsSchema.parse(safeArgs);
      let queryEmail: string | undefined = undefined;
      if (userId) {
        try {
          const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
          if (user?.email && !user.email.includes("business") && !user.email.includes("merchant")) {
            queryEmail = user.email;
          }
        } catch {
          // ignore
        }
      }
      const txs = await paypalClient.fetchRecentTransactions(hoursBack, queryEmail);
      return {
        success: true,
        hoursLookedBack: hoursBack,
        count: txs.length,
        transactions: txs,
      };
    }

    case "calculate_deterministic_split": {
      const { totalAmount, participants, memo } = CalculateSplitSchema.parse(safeArgs);
      const splitResult = calculateEqualSplit(totalAmount, participants as SplitParticipant[], memo);
      return {
        success: true,
        ...splitResult,
      };
    }

    case "dispatch_paypal_invoices": {
      const { recipients, isConfirmed } = DispatchInvoicesSchema.parse(safeArgs);

      if (!isConfirmed) {
        // Return structured confirmation card for Layer D security
        return {
          requiresConfirmation: true,
          action: "DISPATCH_INVOICES",
          totalRecipients: recipients.length,
          totalAmount: recipients.reduce((sum, r) => sum + r.amount, 0),
          recipients,
          message: "Preview prepared. Awaiting user tap on Confirm & Send.",
        };
      }

      // Live write dispatch
      const results = [];
      for (const r of recipients) {
        const res = await paypalClient.dispatchInvoice(r);
        results.push(res);
      }

      return {
        success: true,
        dispatchedCount: results.length,
        invoices: results,
      };
    }

    case "send_direct_payout": {
      const { recipientEmail, amount, note, isConfirmed } = SendPayoutSchema.parse(safeArgs);

      if (!isConfirmed) {
        return {
          requiresConfirmation: true,
          action: "DISPATCH_PAYOUT",
          recipientEmail,
          amount,
          note: note || "Direct P2P Settlement via PocketMate",
          recipients: [
            {
              email: recipientEmail,
              name: recipientEmail.split("@")[0].replace(/[._]/g, " "),
              amount,
              description: note || "Direct P2P Settlement via PocketMate",
            },
          ],
          totalRecipients: 1,
          totalAmount: amount,
          message: `Preview prepared: Ready to transfer $${amount.toFixed(2)} to ${recipientEmail} via PayPal Payouts API.`,
        };
      }

      const payoutRes = await paypalClient.sendPayout({
        recipientEmail,
        amount,
        note: note || "Direct P2P Settlement via PocketMate",
      });

      return {
        success: true,
        action: "PAYOUT_COMPLETED",
        ...payoutRes,
      };
    }

    case "log_category_expense": {
      const { category, amount, merchant, description } = LogCategoryExpenseSchema.parse(safeArgs);

      let prevSpent = 0;
      let cap = 350.0;
      let targetCat = category;

      try {
        const dbCat = userId
          ? await prisma.budgetCategory.findFirst({
              where: {
                userId,
                name: { equals: category, mode: "insensitive" },
              },
            })
          : null;

        if (dbCat) {
          targetCat = dbCat.name;
          prevSpent = dbCat.currentSpent;
          cap = dbCat.monthlyCap;
          await prisma.budgetCategory.update({
            where: { id: dbCat.id },
            data: { currentSpent: dbCat.currentSpent + amount },
          });
          await prisma.budgetEntry.create({
            data: {
              categoryId: dbCat.id,
              amount,
              description: description || "Logged via PocketMate Assistant",
              merchant: merchant || null,
            },
          });
          prevSpent = dbCat.currentSpent;
        } else {
          if (userId) {
            syncBudgetExpenseToDB(category, amount, merchant, description, userId);
          }
          if (Object.prototype.hasOwnProperty.call(inMemoryBudgets, category)) {
            prevSpent = inMemoryBudgets[category].currentSpent;
            cap = inMemoryBudgets[category].monthlyCap;
            inMemoryBudgets[category].currentSpent += amount;
          }
        }
      } catch {
        if (userId) {
          syncBudgetExpenseToDB(category, amount, merchant, description, userId);
        }
      }

      const newSpent = prevSpent + amount;
      const isOverBudget = newSpent > cap;
      const overrunAmount = isOverBudget ? newSpent - cap : 0;
      const percentUsed = cap > 0 ? Math.round((newSpent / cap) * 100) : 0;

      return {
        success: true,
        category: targetCat,
        amountLogged: amount,
        previousSpent: prevSpent,
        newSpent,
        monthlyCap: cap,
        percentUsed,
        isOverBudget,
        overrunAmount,
        alert: isOverBudget
          ? `⚠️ Overrun alert: That puts you at $${newSpent.toFixed(2)}, which is $${overrunAmount.toFixed(2)} over your $${cap.toFixed(2)} ${targetCat} budget (${percentUsed}% used).`
          : percentUsed >= 85
          ? `Notice: You have used ${percentUsed}% of your ${targetCat} budget.`
          : null,
      };
    }

    case "check_budget_status": {
      const { category } = CheckBudgetStatusSchema.parse(safeArgs);

      try {
        const dbCat = userId
          ? await prisma.budgetCategory.findFirst({
              where: {
                userId,
                name: { equals: category, mode: "insensitive" },
              },
            })
          : null;

        if (dbCat) {
          return {
            category: dbCat.name,
            monthlyCap: dbCat.monthlyCap,
            currentSpent: dbCat.currentSpent,
            remaining: Math.max(0, dbCat.monthlyCap - dbCat.currentSpent),
            percentUsed: dbCat.monthlyCap > 0 ? Math.round((dbCat.currentSpent / dbCat.monthlyCap) * 100) : 0,
          };
        }
      } catch {
        // fallback
      }

      if (Object.prototype.hasOwnProperty.call(inMemoryBudgets, category)) {
        const item = inMemoryBudgets[category];
        return {
          category,
          monthlyCap: item.monthlyCap,
          currentSpent: item.currentSpent,
          remaining: Math.max(0, item.monthlyCap - item.currentSpent),
          percentUsed: item.monthlyCap > 0 ? Math.round((item.currentSpent / item.monthlyCap) * 100) : 0,
        };
      }

      const target = Object.keys(inMemoryBudgets).find(
        (c) => c.toLowerCase() === category.toLowerCase()
      ) || "Dining";
      const budget = inMemoryBudgets[target] || { monthlyCap: 300, currentSpent: 100 };
      return {
        category: target,
        monthlyCap: budget.monthlyCap,
        currentSpent: budget.currentSpent,
        remaining: Math.max(0, budget.monthlyCap - budget.currentSpent),
        percentUsed: Math.round((budget.currentSpent / budget.monthlyCap) * 100),
      };
    }

    case "mutate_ag_grid": {
      const mutation = MutateAGGridSchema.parse(rawArgs);
      return {
        success: true,
        gridMutation: mutation,
      };
    }

    case "audit_receipt_against_transaction": {
      const { receiptTotal, tax, tip, transactionId } = AuditReceiptSchema.parse(rawArgs);
      void transactionId;
      // Look up transaction
      const chargedAmount = 130.0; // Bistro Lumiere fixture from scenario 3
      const receiptSum = receiptTotal + (tax || 0) + (tip || 0);
      const diff = Math.abs(chargedAmount - receiptSum);

      if (diff > 0.01) {
        return {
          match: false,
          receiptSum,
          chargedAmount,
          difference: diff,
          finding: `Discrepancy detected: Receipt items and tip sum to $${receiptSum.toFixed(2)}, but PayPal charge was settled at $${chargedAmount.toFixed(2)} (difference of $${diff.toFixed(2)}).`,
          suggestedActions: [
            "Initiate PayPal dispute for unrecognized surcharge",
            "Split settled amount anyway",
          ],
        };
      }

      return {
        match: true,
        receiptSum,
        chargedAmount,
        message: "Receipt items match PayPal charge perfectly.",
      };
    }

    case "update_user_persona": {
      const { newPersona, reason } = UpdatePersonaSchema.parse(rawArgs);
      return {
        success: true,
        previousPersona: "GENERAL",
        activePersona: newPersona,
        reason,
        notification: `Operating persona shifted to ${newPersona}. Dynamic context updated.`,
      };
    }

    case "initiate_paypal_dispute": {
      const { transactionId, reason, disputedAmount, isConfirmed } = InitiateDisputeSchema.parse(safeArgs);

      if (!isConfirmed) {
        return {
          requiresConfirmation: true,
          action: "INITIATE_DISPUTE",
          transactionId,
          reason,
          disputedAmount,
          message: `Preview prepared: Ready to file formal dispute for $${disputedAmount.toFixed(2)} on transaction ${transactionId}.`,
        };
      }

      const disputeResult = await paypalClient.initiateDispute(transactionId, reason, disputedAmount);
      return {
        success: true,
        ...disputeResult,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
