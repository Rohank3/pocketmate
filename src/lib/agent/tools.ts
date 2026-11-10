import { z } from "zod";
import { paypalClient } from "../paypal/client";
import {
  calculateEqualSplit,
  calculateUnequalSplit,
  calculatePercentageSplit,
  SplitParticipant,
  DeterministicSplitResult,
} from "../math/split";
import { syncBudgetExpenseToDB } from "./dbSync";
import { prisma } from "../db";
import type { Prisma } from "@prisma/client";
import {
  loadUserCategorizationContext,
  categorizeTransactionsBatch,
  normalizeMerchant,
  reclassifyTransactionWithScope,
} from "../services/categorizer";
import { resolveContact, saveOrUpdateContact } from "../contacts/contactResolver";

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
  category: z.string().trim().max(50).optional(),
  isConfirmed: z.boolean().default(false),
});

export const CreateSplitSchema = z.object({
  title: z.string().trim().min(1).max(200),
  totalAmount: z.number().finite().positive().max(500000),
  currency: z.string().default("USD"),
  splitType: z.enum(["equal", "unequal", "percentage"]).default("equal"),
  participants: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        emailOrHandle: z.string().trim().max(255).optional(),
        amount: z.number().finite().positive().optional(),
        percentage: z.number().finite().positive().optional(),
      })
    )
    .min(1)
    .max(50),
  dispatchInvoices: z.boolean().default(false),
  isConfirmed: z.boolean().default(false),
});

export const AddScheduledEventSchema = z.object({
  title: z.string().trim().min(1).max(100),
  amount: z.number().finite().positive().max(100000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  type: z.enum(["incoming", "outgoing", "milestone"]).default("outgoing"),
  category: z.string().trim().max(50).default("General"),
  counterparty: z.string().trim().max(100).optional(),
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

export const ConfigureBudgetAlertSchema = z.object({
  categoryName: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .refine((val) => !PROTOTYPE_POLLUTION_KEYS.has(val), "Invalid category name."),
  thresholdPercent: z.number().min(1).max(100).default(80).optional(),
  softCapAmount: z.number().positive().max(1000000).optional(),
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

export const AutoCategorizeTransactionsSchema = z.object({
  hoursBack: z.number().finite().positive().max(720).default(720).optional(),
});

export const SetMerchantCategoryRuleSchema = z.object({
  merchantPattern: z.string().trim().min(2).max(100),
  category: z.string().trim().min(1).max(50),
});

export const SetTransactionCategorySchema = z.object({
  transactionId: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  scope: z.enum(["single", "merchant", "similar"] as const).optional(),
  rememberForMerchant: z.boolean().default(false).optional(),
  merchantName: z.string().trim().max(100).optional(),
});

export const ProposeSplitBreakdownSchema = z.object({
  totalAmount: z.number().finite().positive().max(1000000),
  merchantName: z.string().trim().min(1).max(100),
  transactionId: z.string().trim().max(100).optional(),
  memo: z.string().trim().max(255).optional(),
  participants: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        email: z.string().trim().max(255).optional().default(""),
        amount: z.number().finite().positive().max(1000000),
        isHost: z.boolean().default(false).optional(),
        isLocked: z.boolean().default(false).optional(),
        note: z.string().trim().max(255).optional(),
      })
    )
    .min(1)
    .max(50),
});

export const RememberContactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  emailOrHandle: z.string().trim().min(1).max(255),
});

export const ProposeCategoryTriageSchema = z.object({
  transactionId: z.string().trim().min(1).max(100),
  merchantName: z.string().trim().min(1).max(100),
  amount: z.number().finite().optional(),
  suggestedCategory: z.string().trim().min(1).max(50),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().trim().max(500).optional(),
});

export const ReviewIncomingInvoiceSchema = z.object({
  invoiceId: z.string().trim().min(1).max(100),
  merchantName: z.string().trim().min(1).max(100).optional(),
  amount: z.number().finite().positive().max(500000),
  currency: z.string().default("USD").optional(),
  senderName: z.string().trim().max(100).optional(),
  senderEmail: z.string().trim().email().max(255).optional(),
  memo: z.string().trim().max(255).optional(),
  paypalInvoiceUrl: z.string().url().optional(),
});

// ============================================================================
// In-Memory Fallback State (Simulating DB when Neon is not connected)
// ============================================================================

export interface MockBudgetStore {
  [category: string]: { monthlyCap: number; currentSpent: number };
}

export const inMemoryBudgets: MockBudgetStore = Object.assign(Object.create(null), {});

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
    name: "create_split",
    description: "Records an expense split (equal, custom unequal amounts, or percentages) backed by SplitRecord database entities. Works with USD ($) or INR (₹). Can dispatch PayPal invoices.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Title or memo of what was split, e.g. 'Dinner with friends' or 'Office supplies'." },
        totalAmount: { type: "NUMBER", description: "Total expense amount." },
        currency: { type: "STRING", description: "Currency code (USD, INR, etc.), default USD." },
        splitType: { type: "STRING", description: "'equal', 'unequal' (specific dollar amounts), or 'percentage'." },
        participants: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              emailOrHandle: { type: "STRING" },
              amount: { type: "NUMBER" },
              percentage: { type: "NUMBER" },
            },
            required: ["name"],
          },
          description: "List of participants and their shares.",
        },
        dispatchInvoices: { type: "BOOLEAN", description: "Whether to dispatch real PayPal invoices to participants." },
      },
      required: ["title", "totalAmount", "participants"],
    },
  },
  {
    name: "add_scheduled_event",
    description: "Schedules a recurring bill, rent, utility, subscription, or expected receivable in the user's financial calendar (e.g. 'add my rent of $1200 due on the 1st of every month').",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Title of bill/income, e.g. 'Apartment Rent' or 'Electric Utility'." },
        amount: { type: "NUMBER", description: "Amount of bill." },
        date: { type: "STRING", description: "Target date (YYYY-MM-DD)." },
        dayOfMonth: { type: "NUMBER", description: "Day of the month (1-31)." },
        type: { type: "STRING", description: "'outgoing' (bill) or 'incoming' (receivable)." },
        category: { type: "STRING", description: "Category (Rent, Utilities, Entertainment, etc.)." },
        counterparty: { type: "STRING", description: "Landlord, utility company, or provider name." },
      },
      required: ["title", "amount"],
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
    description: "Transfers funds directly from your PayPal Sandbox account to a recipient using PayPal Payouts API. Used for direct settlements, reimbursements, or payments ('pay Alex $50', 'send $30 to Sarah'). Returns an interactive preview card if not confirmed.",
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
    name: "configure_budget_alert",
    description: "Configures a proactive budget threshold warning or soft-cap alert for a category (e.g. alert me at 80% or $120 spent on Entertainment). Never creates a scheduled bill or debt.",
    parameters: {
      type: "OBJECT",
      properties: {
        categoryName: { type: "STRING", description: "Target category name, e.g. Entertainment, Groceries, Dining." },
        thresholdPercent: { type: "NUMBER", description: "Spending threshold percentage to trigger alert (e.g. 80 for 80%). Default is 80." },
        softCapAmount: { type: "NUMBER", description: "Optional dollar amount threshold to trigger alert (e.g. 120.00)." },
      },
      required: ["categoryName"],
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
  {
    name: "auto_categorize_transactions",
    description: "Runs the intelligent hybrid categorizer across all recent transactions, applying learned merchant rules and AI inference against the user's active categories.",
    parameters: {
      type: "OBJECT",
      properties: {
        hoursBack: { type: "NUMBER", description: "Hours of transaction history to scan (default: 720)." },
      },
    },
  },
  {
    name: "set_merchant_category_rule",
    description: "Saves a persistent merchant rule so any future transaction from this merchant is automatically categorized without prompting the user.",
    parameters: {
      type: "OBJECT",
      properties: {
        merchantPattern: { type: "STRING", description: "Normalized merchant name or keyword, e.g. 'Starbucks' or 'Spotify'." },
        category: { type: "STRING", description: "Target category name from the user's budget categories." },
      },
      required: ["merchantPattern", "category"],
    },
  },
  {
    name: "propose_split_breakdown",
    description: "Proposes an interactive split breakdown to the user with exact amounts per participant. Call this whenever the user wants to split an expense, bill, or hotel/dining charge.",
    parameters: {
      type: "OBJECT",
      properties: {
        totalAmount: { type: "NUMBER", description: "Total dollar amount of the expense being split." },
        merchantName: { type: "STRING", description: "Name of the merchant or venue (e.g. Grand Vista Hotel)." },
        transactionId: { type: "STRING", description: "Optional transaction ID of the expense in PayPal." },
        memo: { type: "STRING", description: "Summary or description of the split breakdown." },
        participants: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING", description: "Participant name (use 'You' or user's name for the host)." },
              email: { type: "STRING", description: "Email address if known." },
              amount: { type: "NUMBER", description: "Dollar amount allocated to this participant." },
              isHost: { type: "BOOLEAN", description: "True if this person is the host who paid the initial bill." },
              isLocked: { type: "BOOLEAN", description: "True if this participant has a fixed custom amount." },
              note: { type: "STRING", description: "Note explaining differential stay or items." },
            },
            required: ["name", "amount"],
          },
          description: "List of all participants involved in the split (including the host and friends).",
        },
      },
      required: ["totalAmount", "merchantName", "participants"],
    },
  },
  {
    name: "set_transaction_category",
    description: "Assigns a category to a specific transaction in the ledger, with optional scope ('single' for only this transaction, 'merchant' for all transactions from this merchant, 'similar' for all semantically similar charges).",
    parameters: {
      type: "OBJECT",
      properties: {
        transactionId: { type: "STRING", description: "PayPal transaction ID." },
        category: { type: "STRING", description: "Target category name." },
        scope: {
          type: "STRING",
          enum: ["single", "merchant", "similar"],
          description: "Scope of reclassification: 'single', 'merchant', or 'similar'.",
        },
        rememberForMerchant: { type: "BOOLEAN", description: "Whether to always categorize this merchant into this category in the future." },
        merchantName: { type: "STRING", description: "Merchant name if rememberForMerchant or scope is used." },
      },
      required: ["transactionId", "category"],
    },
  },
  {
    name: "remember_contact",
    description: "Saves or updates a contact's name and PayPal email address/handle permanently in the active user's contact book. Call this whenever the user specifies or mentions someone's email or PayPal ID (e.g. 'Leo's email is leo.vance@example.com').",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "The person's full name or first name, e.g. 'Leo' or 'Leo Vance'." },
        emailOrHandle: { type: "STRING", description: "The PayPal email address or handle for this contact." },
      },
      required: ["name", "emailOrHandle"],
    },
  },
  {
    name: "propose_category_triage",
    description: "Presents an interactive Category Triage card to the user in chat for an unclassified transaction, enabling them to one-tap apply the suggested category with 3 scopes: [Only this transaction], [All merchant transactions], or [All similar transactions]. Call this whenever a transaction needs category classification or review.",
    parameters: {
      type: "OBJECT",
      properties: {
        transactionId: { type: "STRING", description: "ID of the transaction to classify." },
        merchantName: { type: "STRING", description: "Name of the merchant (e.g. Equinox Fitness, Google Cloud Storage)." },
        amount: { type: "NUMBER", description: "Dollar amount of the transaction." },
        suggestedCategory: { type: "STRING", description: "AI-suggested category based on merchant and user budget categories." },
        confidence: { type: "NUMBER", description: "Confidence score between 0.0 and 1.0." },
        reasoning: { type: "STRING", description: "Short explanation for the suggested category." },
      },
      required: ["transactionId", "merchantName", "suggestedCategory"],
    },
  },
  {
    name: "review_incoming_invoice",
    description: "Initiates an interactive review card for an incoming debt or PayPal invoice where the authenticated user is the recipient/debtor. Prompts with 3 one-tap resolution options: (1) Pay in Full via PayPal, (2) Pay with Different Value (with custom amount & reason), and (3) Decline (with reason). Never suggest sending reminders when the user is the debtor.",
    parameters: {
      type: "OBJECT",
      properties: {
        invoiceId: { type: "STRING", description: "The PayPal invoice ID or split transaction ID to review." },
        merchantName: { type: "STRING", description: "The memo or merchant description, e.g. 'Grand Vista Hotel split share'." },
        amount: { type: "NUMBER", description: "The dollar amount owed on this incoming invoice." },
        senderName: { type: "STRING", description: "The name of the user who sent the invoice (e.g. 'Jane Doe')." },
        senderEmail: { type: "STRING", description: "The email of the user who sent the invoice." },
        currency: { type: "STRING", description: "Currency code (default: USD)." },
        memo: { type: "STRING", description: "Optional memo or description." },
        paypalInvoiceUrl: { type: "STRING", description: "Optional authentic PayPal invoice payment URL." },
      },
      required: ["invoiceId", "amount"],
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
      let senderInfo: { name?: string; email?: string } | undefined = undefined;
      if (userId) {
        try {
          const userRec = await prisma.user.findFirst({
            where: {
              OR: [{ id: userId }, { email: userId }],
            },
            select: { name: true, email: true },
          });
          if (userRec) {
            senderInfo = {
              name: userRec.name || userRec.email.split("@")[0].replace(/[._]/g, " "),
              email: userRec.email,
            };
          }
        } catch {
          // ignore
        }
      }

      const results = [];
      for (const r of recipients) {
        const res = await paypalClient.dispatchInvoice(r, senderInfo);
        results.push(res);
        if (userId && r.email) {
          try {
            await saveOrUpdateContact(userId, r.name || r.email.split("@")[0], r.email);
          } catch {
            // ignore
          }
        }
      }

      // Persist to PostgreSQL if authenticated user
      if (userId) {
        try {
          const totalDispatchedAmount = recipients.reduce((sum, r) => sum + r.amount, 0);
          await prisma.splitRecord.create({
            data: {
              userId,
              totalAmount: totalDispatchedAmount,
              status: "SENT",
              description: recipients[0]?.description || "Shared Bill Split",
              items: {
                create: results.map((inv, idx) => ({
                  participantName: recipients[idx]?.name || "Recipient",
                  participantEmail: recipients[idx]?.email || "",
                  amount: recipients[idx]?.amount || 0,
                  paypalInvoiceId: inv.invoiceId,
                  status: "SENT",
                })),
              },
            },
          });
        } catch (dbErr) {
          console.warn("[Split Record DB Persistence Warning]", dbErr);
        }
      }

      return {
        success: true,
        dispatchedCount: results.length,
        invoices: results,
      };
    }

    case "send_direct_payout": {
      const { recipientEmail, amount, note, category, isConfirmed } = SendPayoutSchema.parse(safeArgs);

      if (!isConfirmed) {
        return {
          requiresConfirmation: true,
          action: "DISPATCH_PAYOUT",
          recipientEmail,
          amount,
          category: category || "Personal Reimbursement",
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

      if (category && userId) {
        try {
          await prisma.transactionCategoryOverride.upsert({
            where: {
              userId_transactionId: {
                userId,
                transactionId: payoutRes.payoutBatchId,
              },
            },
            update: { categoryName: category },
            create: {
              userId,
              transactionId: payoutRes.payoutBatchId,
              categoryName: category,
            },
          });
        } catch (catErr) {
          console.warn("[Payout Category Override Warning]", catErr);
        }
      }

      return {
        success: true,
        action: "PAYOUT_COMPLETED",
        category: category || "Personal Reimbursement",
        ...payoutRes,
      };
    }

    case "create_split": {
      const { title, totalAmount, currency, splitType, participants, dispatchInvoices, isConfirmed } =
        CreateSplitSchema.parse(safeArgs);

      let calculated: DeterministicSplitResult;
      if (splitType === "percentage") {
        const pShares = participants.map((p) => ({
          name: p.name,
          emailOrHandle: p.emailOrHandle || `${p.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          percentage: p.percentage ?? (100 / participants.length),
        }));
        calculated = calculatePercentageSplit(totalAmount, pShares, title);
      } else if (splitType === "unequal" && participants.some((p) => p.amount !== undefined)) {
        const uShares = participants.map((p) => ({
          name: p.name,
          emailOrHandle: p.emailOrHandle || `${p.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          amount: p.amount ?? (totalAmount / participants.length),
        }));
        calculated = calculateUnequalSplit(totalAmount, uShares, title);
      } else {
        const eShares = participants.map((p) => ({
          name: p.name,
          emailOrHandle: p.emailOrHandle || `${p.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        }));
        calculated = calculateEqualSplit(totalAmount, eShares, title);
      }

      const recipients = calculated.allocations.map((a) => ({
        email: a.emailOrHandle.includes("@") ? a.emailOrHandle : `${a.name.toLowerCase().replace(/\s+/g, ".")}@personal.example.com`,
        name: a.name,
        amount: a.amount,
        description: `Split: ${title} (${a.name}'s share)`,
      }));

      if (!isConfirmed) {
        return {
          requiresConfirmation: true,
          action: "DISPATCH_INVOICES",
          totalRecipients: recipients.length,
          totalAmount: calculated.totalAmount,
          currency,
          recipients,
          message: `Split preview prepared: $${calculated.totalAmount.toFixed(2)} divided across ${recipients.length} people.`,
          breakdown: calculated.breakdownReport,
        };
      }

      let savedRecord = null;
      if (userId) {
        try {
          savedRecord = await prisma.splitRecord.create({
            data: {
              userId,
              totalAmount: calculated.totalAmount,
              status: dispatchInvoices ? "SENT" : "PENDING_CONFIRMATION",
              description: title,
              itemsJson: calculated.allocations as unknown as Prisma.InputJsonValue,
              items: {
                create: calculated.allocations.map((a) => ({
                  participantName: a.name,
                  participantEmail: a.emailOrHandle.includes("@") ? a.emailOrHandle : `${a.name.toLowerCase().replace(/\s+/g, ".")}@personal.example.com`,
                  amount: a.amount,
                  status: dispatchInvoices ? "SENT" : "DRAFT",
                })),
              },
            },
            include: { items: true },
          });
        } catch (dbErr) {
          console.warn("[SplitRecord Create Warning]", dbErr);
        }
      }

      const invoiceResults = [];
      if (dispatchInvoices) {
        let senderInfo: { name?: string; email?: string } | undefined = undefined;
        if (userId) {
          try {
            const userRec = await prisma.user.findFirst({
              where: {
                OR: [{ id: userId }, { email: userId }],
              },
              select: { name: true, email: true },
            });
            if (userRec) {
              senderInfo = {
                name: userRec.name || (userRec.email ? userRec.email.split("@")[0].replace(/[._]/g, " ") : "Organizer"),
                email: userRec.email,
              };
            }
          } catch {
            // ignore
          }
        }

        for (const r of recipients) {
          try {
            const res = await paypalClient.dispatchInvoice(r, senderInfo);
            invoiceResults.push(res);
          } catch (invErr) {
            console.warn("[Dispatch Invoice in Split Error]", invErr);
          }
        }
      }

      return {
        success: true,
        splitRecordId: savedRecord?.id || `split_${Date.now()}`,
        totalAmount: calculated.totalAmount,
        currency,
        allocations: calculated.allocations,
        breakdownReport: calculated.breakdownReport,
        invoicesDispatched: invoiceResults.length,
      };
    }

    case "add_bill":
    case "add_scheduled_event": {
      const { title, amount, date, dayOfMonth, type, category, counterparty } =
        AddScheduledEventSchema.parse(safeArgs);

      const titleLower = title.toLowerCase();
      if (
        titleLower.includes("alert") ||
        titleLower.includes("soft cap") ||
        titleLower.includes("threshold")
      ) {
        return {
          success: false,
          error: "Budget threshold alerts and soft caps must be configured using 'configure_budget_alert', not 'add_scheduled_event'. Scheduled events are strictly reserved for actual calendar payment commitments.",
        };
      }

      const today = new Date();
      let eventDate = date;
      const targetDay = dayOfMonth ?? (date ? parseInt(date.slice(8, 10), 10) : today.getDate());

      if (!eventDate) {
        let yr = today.getFullYear();
        let mo = today.getMonth() + 1;
        if (targetDay < today.getDate()) {
          mo += 1;
          if (mo > 12) {
            mo = 1;
            yr += 1;
          }
        }
        eventDate = `${yr}-${String(mo).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
      }

      let createdEvent = null;
      if (userId) {
        try {
          createdEvent = await prisma.scheduledEvent.create({
            data: {
              userId,
              title,
              amount,
              date: eventDate,
              dayOfMonth: targetDay,
              type,
              category,
              counterparty: counterparty || null,
              status: "scheduled",
            },
          });
        } catch (dbErr) {
          console.warn("[ScheduledEvent Create Warning]", dbErr);
        }
      }

      return {
        success: true,
        event: createdEvent || {
          id: `evt_${Date.now()}`,
          title,
          amount,
          date: eventDate,
          dayOfMonth: targetDay,
          type,
          category,
          counterparty,
          status: "scheduled",
        },
        message: `Scheduled ${type === "incoming" ? "receivable" : "bill"} "${title}" ($${amount.toFixed(2)}) due on ${eventDate}.`,
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

    case "configure_budget_alert": {
      const { categoryName, thresholdPercent, softCapAmount } =
        ConfigureBudgetAlertSchema.parse(safeArgs);

      let updatedCategory = null;
      let targetMonthlyCap = 150;
      let pct = thresholdPercent ?? 80;

      if (userId) {
        try {
          const userCategories = await prisma.budgetCategory.findMany({
            where: { userId },
          });
          const match = userCategories.find(
            (c) => c.name.toLowerCase() === categoryName.toLowerCase()
          );
          if (match) {
            targetMonthlyCap = match.monthlyCap;
            let computedSoftCap: number;
            if (softCapAmount !== undefined) {
              computedSoftCap = softCapAmount;
              pct = Math.round((softCapAmount / match.monthlyCap) * 100);
            } else {
              computedSoftCap = match.monthlyCap * (pct / 100);
            }
            updatedCategory = await prisma.budgetCategory.update({
              where: { id: match.id },
              data: {
                alertThreshold: pct / 100,
                softCap: computedSoftCap,
              },
            });
          }
        } catch (dbErr) {
          console.warn("[ConfigureBudgetAlert DB Warning]", dbErr);
        }
      }

      const effectiveSoftCap = softCapAmount ?? (targetMonthlyCap * (pct / 100));

      return {
        success: true,
        category: updatedCategory?.name || categoryName,
        monthlyCap: updatedCategory?.monthlyCap || targetMonthlyCap,
        thresholdPercent: pct,
        softCap: updatedCategory?.softCap || effectiveSoftCap,
        message: `Proactive budget threshold alert configured for ${updatedCategory?.name || categoryName} at ${pct}% ($${effectiveSoftCap.toFixed(2)} of $${targetMonthlyCap.toFixed(2)} monthly ceiling). You will be notified before any overrun occurs without generating any scheduled bills.`,
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
      let chargedAmount = receiptTotal + (tax || 0) + (tip || 0);

      if (transactionId) {
        try {
          const recentTxs = await paypalClient.fetchRecentTransactions(168);
          const foundTx = recentTxs.find((t) => t.id === transactionId);
          if (foundTx) {
            chargedAmount = foundTx.amount;
          }
        } catch (err) {
          console.warn("[AuditReceipt PayPal Warning]", err);
        }
      }

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

    case "auto_categorize_transactions": {
      const { hoursBack } = AutoCategorizeTransactionsSchema.parse(safeArgs);
      const effectiveUserId = userId || "demo_user";

      let filterEmail: string | undefined = undefined;
      if (effectiveUserId.includes("@")) {
        filterEmail = effectiveUserId;
      } else {
        const u = await prisma.user.findUnique({ where: { id: effectiveUserId } });
        if (u?.email) filterEmail = u.email;
      }

      const txs = await paypalClient.fetchRecentTransactions(hoursBack || 720, filterEmail);
      const catContext = await loadUserCategorizationContext(effectiveUserId);
      const categoryMap = await categorizeTransactionsBatch(
        txs.map((t) => ({ id: t.id, merchantName: t.merchantName, amount: t.amount })),
        catContext
      );

      const categorizedList: Array<{
        id: string;
        merchant: string;
        amount: number;
        category: string;
        confidence: number;
        source: string;
      }> = [];

      let uncategorizedCount = 0;
      for (const t of txs) {
        const res = categoryMap.get(t.id);
        const cat = res?.category || "Uncategorized";
        if (cat === "Uncategorized") {
          uncategorizedCount++;
        } else {
          categorizedList.push({
            id: t.id,
            merchant: t.merchantName,
            amount: t.amount,
            category: cat,
            confidence: res?.confidence || 0.85,
            source: res?.source || "gemini_ai",
          });

          // Persist override to database so reload retains classification
          try {
            await prisma.transactionCategoryOverride.upsert({
              where: {
                userId_transactionId: {
                  userId: effectiveUserId,
                  transactionId: t.id,
                },
              },
              update: { categoryName: cat },
              create: {
                userId: effectiveUserId,
                transactionId: t.id,
                categoryName: cat,
              },
            });
          } catch (persistErr) {
            console.warn("[AutoCategorize Persist Warning]", persistErr);
          }
        }
      }

      if (uncategorizedCount > 0) {
        const firstUncat = txs.find((t) => (categoryMap.get(t.id)?.category || "Uncategorized") === "Uncategorized");
        if (firstUncat) {
          const res = categoryMap.get(firstUncat.id);
          const suggested =
            res?.suggestedCategory && res.suggestedCategory.toLowerCase() !== "uncategorized"
              ? res.suggestedCategory
              : (catContext.activeCategories?.[0]?.name || "Uncategorized");
          return {
            success: true,
            scannedCount: txs.length,
            categorizedCount: categorizedList.length,
            uncategorizedRemaining: uncategorizedCount,
            categorized: categorizedList,
            requiresConfirmation: true,
            action: "CATEGORY_TRIAGE",
            type: "category_triage",
            transactionId: firstUncat.id,
            merchantName: firstUncat.merchantName,
            merchant: firstUncat.merchantName,
            amount: firstUncat.amount,
            totalAmount: firstUncat.amount,
            suggestedCategory: suggested,
            category: suggested,
            confidence: res?.confidence || 0,
            reasoning:
              res?.reasoning ||
              `Found ${uncategorizedCount} unclassified transactions. Review '${firstUncat.merchantName}' to assign scope.`,
            message: `Categorized ${categorizedList.length} of ${txs.length} transactions. ${uncategorizedCount} remain unclassified—tap a scope below to classify '${firstUncat.merchantName}'.`,
          };
        }
      }

      return {
        success: true,
        scannedCount: txs.length,
        categorizedCount: categorizedList.length,
        uncategorizedRemaining: uncategorizedCount,
        categorized: categorizedList,
        message: `Categorized ${categorizedList.length} of ${txs.length} transactions across your active categories. All transactions are fully classified.`,
      };
    }

    case "set_merchant_category_rule": {
      const { merchantPattern, category } = SetMerchantCategoryRuleSchema.parse(safeArgs);
      const effectiveUserId = userId || "demo_user";
      const normalizedPattern = normalizeMerchant(merchantPattern);

      const rule = await prisma.merchantCategoryRule.upsert({
        where: {
          userId_merchantPattern: {
            userId: effectiveUserId,
            merchantPattern: normalizedPattern,
          },
        },
        update: {
          categoryName: category,
          isAutoLearned: false,
        },
        create: {
          userId: effectiveUserId,
          merchantPattern: normalizedPattern,
          categoryName: category,
          isAutoLearned: false,
        },
      });

      return {
        success: true,
        ruleId: rule.id,
        merchantPattern: normalizedPattern,
        category,
        message: `Persistent rule saved: All past and future transactions for '${merchantPattern}' will be automatically mapped to '${category}'.`,
      };
    }

    case "propose_split_breakdown": {
      const parsed = ProposeSplitBreakdownSchema.parse(safeArgs);
      const effectiveUserId = userId || "demo_user";

      // Auto-resolve known emails from Prisma contacts / transaction history
      const resolvedParticipants = await Promise.all(
        parsed.participants.map(async (p) => {
          if (p.email && p.email.includes("@")) {
            // User provided an email - persist it immediately so it's remembered!
            await saveOrUpdateContact(effectiveUserId, p.name, p.email);
            return p;
          }
          if (p.isHost || p.name.toLowerCase() === "you" || p.name.toLowerCase() === "me") {
            return { ...p, isHost: true };
          }
          const contact = await resolveContact(p.name, effectiveUserId);
          return {
            ...p,
            email: contact?.email || p.email || "",
          };
        })
      );

      // Extract non-host recipients for invoice dispatching
      const recipients = resolvedParticipants
        .filter((p) => !p.isHost && p.name.toLowerCase() !== "you" && p.name.toLowerCase() !== "me")
        .map((p) => ({
          name: p.name,
          email: p.email || "",
          amount: p.amount,
          description: p.note || `${parsed.merchantName} shared split`,
        }));

      return {
        action: "PROPOSE_SPLIT_BREAKDOWN",
        type: "split_breakdown",
        totalAmount: parsed.totalAmount,
        merchant: parsed.merchantName,
        transactionId: parsed.transactionId,
        memo: parsed.memo || `${parsed.merchantName} shared expense`,
        participants: resolvedParticipants,
        recipients,
        requiresConfirmation: true,
        message: `Prepared split breakdown for ${parsed.merchantName} ($${parsed.totalAmount.toFixed(2)} total). Review allocations or adjust inline below before sending invoices.`,
      };
    }

    case "set_transaction_category": {
      const { transactionId, category, scope, rememberForMerchant, merchantName } =
        SetTransactionCategorySchema.parse(safeArgs);
      const effectiveUserId = userId || "demo_user";

      const effectiveScope = scope || (rememberForMerchant ? "merchant" : "single");

      const reclassResult = await reclassifyTransactionWithScope({
        userId: effectiveUserId,
        transactionId,
        merchantName: merchantName || "Merchant",
        targetCategory: category,
        scope: effectiveScope,
      });

      return {
        success: true,
        scope: effectiveScope,
        transactionId,
        category,
        updatedCount: reclassResult.updatedTransactionIds.length,
        message: reclassResult.message,
      };
    }

    case "remember_contact": {
      const { name, emailOrHandle } = RememberContactSchema.parse(safeArgs);
      const effectiveUserId = userId || "demo_user";
      const cleanEmail = emailOrHandle.includes("@")
        ? emailOrHandle.trim().toLowerCase()
        : `${name.toLowerCase().replace(/\s+/g, ".")}@personal.example.com`;

      const saved = await saveOrUpdateContact(
        effectiveUserId,
        name.trim(),
        cleanEmail,
        !emailOrHandle.includes("@") ? emailOrHandle.trim() : undefined
      );

      return {
        success: true,
        contact: saved,
        message: `Saved contact for ${name.trim()} (${cleanEmail}) to your personal address book.`,
      };
    }

    case "propose_category_triage": {
      const parsed = ProposeCategoryTriageSchema.parse(safeArgs);
      return {
        requiresConfirmation: true,
        action: "CATEGORY_TRIAGE",
        type: "category_triage",
        transactionId: parsed.transactionId,
        merchantName: parsed.merchantName,
        merchant: parsed.merchantName,
        amount: parsed.amount,
        totalAmount: parsed.amount,
        suggestedCategory: parsed.suggestedCategory,
        category: parsed.suggestedCategory,
        confidence: parsed.confidence ?? 0,
        reasoning: parsed.reasoning || `Suggested category based on merchant '${parsed.merchantName}' and budget allocations.`,
        message: `Proposed category '${parsed.suggestedCategory}' for ${parsed.merchantName}. Tap a scope to apply.`,
      };
    }

    case "review_incoming_invoice": {
      const parsed = ReviewIncomingInvoiceSchema.parse(safeArgs);
      let senderName = parsed.senderName;
      let senderEmail = parsed.senderEmail;
      let memo = parsed.memo || parsed.merchantName || "Split share invoice";
      let splitItemId: string | undefined = undefined;

      const splitItem = await prisma.splitItem.findFirst({
        where: {
          OR: [
            { paypalInvoiceId: parsed.invoiceId },
            { id: parsed.invoiceId },
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

      if (splitItem) {
        splitItemId = splitItem.id;
        senderName = senderName || splitItem.splitRecord.user.name || "Organizer";
        senderEmail = senderEmail || splitItem.splitRecord.user.email;
        memo = splitItem.splitRecord.description || memo;
      }

      const invoiceUrl =
        parsed.paypalInvoiceUrl || `https://www.sandbox.paypal.com/invoice/p/#${parsed.invoiceId}`;

      return {
        action: "REVIEW_INCOMING_INVOICE",
        type: "incoming_invoice_review",
        invoiceId: parsed.invoiceId,
        splitItemId,
        amount: parsed.amount,
        totalAmount: parsed.amount,
        currency: parsed.currency || "USD",
        merchant: parsed.merchantName || memo,
        merchantName: parsed.merchantName || memo,
        senderName: senderName || "Organizer",
        senderEmail: senderEmail || "",
        recipientName: "You",
        memo,
        paypalInvoiceUrl: invoiceUrl,
        requiresConfirmation: true,
        message: `I've opened the payment review for your pending debt of $${parsed.amount.toFixed(
          2
        )} (${parsed.merchantName || memo}). Please select one of the three options below: Pay in Full, Pay with Different Value, or Decline.`,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
