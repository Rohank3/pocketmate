# PocketMate

PocketMate is a full-stack Next.js financial management and PayPal Sandbox workspace for tracking ledger transactions, categorizing expenses with user rules and Gemini, splitting shared bills with PayPal Invoicing v2 and Orders v2 checkout, auditing receipts, and monitoring recurring bills.

## Stack

- **Framework**: Next.js 16 (App Router, TypeScript, Tailwind CSS)
- **Database**: PostgreSQL (Neon) via Prisma ORM (`prisma/schema.prisma`)
- **AI**: Google Gemini (`@google/genai`) with Zod-validated tool schemas (`src/lib/agent/tools.ts`)
- **Payments & Identity**: PayPal REST APIs (`src/lib/paypal/`) — Log in with PayPal, Partner Referrals, Orders v2 direct-payee capture, Invoicing v2, Payouts, Transaction Search/Reporting, and Webhooks
- **UI**: AG Grid / AG Studio, Bryntum Scheduler, Recharts / Canvas visualizations

## Repository Layout

```text
pocketmate/
├── prisma/
│   └── schema.prisma             # Users, budgets, splits, ledger cache, rules, chat threads
├── scripts/
│   ├── generate-sandbox-csv.ts   # Generates git-ignored sandbox-users.csv for PayPal import
│   ├── seed-sandbox-simulation.ts# Seeds/cleans PayPal Sandbox test invoices and DB state
│   └── ...
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/            # Agent tool execution & SSE streaming endpoints
│   │   │   ├── auth/paypal/      # OAuth, profile completion, Partner onboarding callbacks
│   │   │   ├── chat/             # Thread & message persistence/hydration APIs
│   │   │   ├── cron/sweep/       # Scheduled reconciliation endpoint
│   │   │   ├── events/           # Recurring bills & calendar schedule API
│   │   │   ├── invoices/resolve/ # Pay / decline & post-dispute actions
│   │   │   ├── paypal/           # Ledger sync, orders/capture, transfer, webhook listener
│   │   │   ├── receipt/audit/    # Receipt image inspection endpoint
│   │   │   ├── splits/           # Split CRUD, rebalance, and declined Ask Again/Dismiss APIs
│   │   │   └── transactions/     # Transaction category & bulk reclassification APIs
│   │   └── page.tsx              # Main dashboard & conversational workspace
│   ├── components/
│   │   ├── auth/                 # PayPalLoginModal
│   │   ├── cards/                # Metrics row, Action Required flyout, chat action cards
│   │   ├── chat/                 # ChatPanel & thread history UI
│   │   ├── grid/                 # TransactionGrid
│   │   ├── modals/               # Reminder, Category, & Uncategorized review modals
│   │   └── scheduler/            # BudgetScheduler (Upcoming & Due calendar)
│   └── lib/
│       ├── agent/                # Orchestrator, prompts, tool schemas, chat DB helpers
│       ├── auth/                 # HMAC cookie session helpers
│       ├── math/                 # Penny-locked split math
│       ├── paypal/               # PayPal API client, sync, settlement, OAuth profile parsing
│       └── services/             # Transaction categorizer & rule engine
├── render.yaml                   # Render Web Service + daily cron blueprint
└── .env.example                  # Documented environment variable keys
```

---

## Important Note on Local Development vs. PayPal Sandbox

Local `http://localhost:3000` **cannot be used to test the full PayPal authentication or webhook flows**:

1. **PayPal Login (`GET /api/auth/paypal` -> `/api/auth/callback/paypal`)**: PayPal Sandbox OAuth requires a public HTTPS Return URL registered on your PayPal Developer App and restricts localhost OAuth callbacks and claim delivery (`openid`/`userinfo`) during Platform app testing.
2. **PayPal Partner Onboarding & Webhooks (`/api/auth/paypal/onboard/callback`, `/api/paypal/webhook`)**: PayPal webhook delivery requires a publicly reachable HTTPS endpoint. PayPal cannot deliver webhook events (`INVOICING.INVOICE.PAID`, checkout/dispute events) to `localhost`.

Use local `npm run dev` only for UI work, build/lint verification (`npm run lint && npm run build`), or running CLI scripts (`seed:paypal`, `csv:paypal`, Prisma schema commands). Run live PayPal login, checkout, split settlement, and webhook tests against a Render deployment (or an HTTPS URL registered in your PayPal App settings).

---

## Deploying on Render

The repository includes [`render.yaml`](render.yaml) defining both the Node web service (`pocketmate`) and an optional daily cron job (`pocketmate-eod-sweep`).

### 1. Prepare External Services

1. **PostgreSQL (Neon)**: Create a Neon database and copy its pooled `DATABASE_URL` connection string (`?sslmode=require`).
2. **Google AI Studio**: Create a Gemini API key (`GEMINI_API_KEY`).
3. **PayPal Developer Dashboard**:
   - Open your **Sandbox** app at [developer.paypal.com/dashboard/applications/sandbox](https://developer.paypal.com/dashboard/applications/sandbox).
   - Enable **Log in with PayPal** (check the main checkbox and inside **Manage** enable **Full name**, **Email**, and **Unconfirmed email**, then click **Save** and **Save Changes** on the app page).
   - Set **Return URL** under Log in with PayPal to:
     ```text
     https://<your-service>.onrender.com/api/auth/callback/paypal
     ```
   - Create a Sandbox Webhook pointing to:
     ```text
     https://<your-service>.onrender.com/api/paypal/webhook
     ```
     Select invoicing/checkout events (including `INVOICING.INVOICE.PAID`) and copy the generated **Webhook ID** (`PAYPAL_WEBHOOK_ID`).

### 2. Deploy via Render Blueprint or Web Service

**Option A — Render Blueprint (`render.yaml`)**
1. In the Render Dashboard, choose **New + -> Blueprint** and connect your Git repository.
2. Render reads `render.yaml`:
   - **Build Command**:
     ```bash
     npm install --include=dev && npx prisma generate && npx prisma db push --skip-generate && npm run build
     ```
   - **Start Command**:
     ```bash
     npm start
     ```
3. Fill in all prompted environment variables (`sync: false`) and update `NEXTAUTH_URL` (and the cron URL if using the cron job) if your Render service name differs from `pocketmate.onrender.com`.

**Option B — Manual Render Web Service**
1. Create a **New Web Service** from the repository (`Runtime: Node`).
2. Set the build and start commands shown above.
3. Configure the environment variables below under **Environment**.

### 3. Required & Optional Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | Set to `production` on Render |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string (`?sslmode=require`) |
| `GEMINI_API_KEY` | Yes | Primary Google Gemini API key |
| `GEMINI_API_KEY_SECONDARY` | No | Optional backup Gemini key for failover |
| `GEMINI_MODEL` | Yes | Gemini model name (e.g., `gemini-3.1-flash-lite` in `render.yaml`) |
| `PAYPAL_CLIENT_ID` | Yes | PayPal Sandbox App Client ID |
| `PAYPAL_CLIENT_SECRET` | Yes | PayPal Sandbox App Client Secret |
| `PAYPAL_ENVIRONMENT` | Yes | Set to `sandbox` (or `live`) |
| `PAYPAL_WEBHOOK_ID` | Recommended | Webhook ID from PayPal Dashboard for signature verification |
| `PAYPAL_BN_CODE` | No | PayPal Partner Attribution ID, if assigned |
| `PAYPAL_BUSINESS_EMAIL` | No | Optional platform business email for fallback invoice dispatch |
| `NEXTAUTH_URL` | Yes | Public service origin, e.g. `https://<your-service>.onrender.com` |
| `NEXTAUTH_SECRET` | Yes | Random secret used to sign session cookies |
| `CRON_SECRET` | Recommended | Bearer secret for `GET /api/cron/sweep` |
| `SANDBOX_DEFAULT_PASSWORD` | No | Password used by local CSV generator (`npm run csv:paypal`) |
| `AG_STUDIO_LICENSE_KEY` | No | Optional AG Studio license key |
| `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` | No | Optional client AG Studio license key |
| `NEXT_PUBLIC_BRYNTUM_LICENSE_KEY` | No | Optional Bryntum Scheduler license key |

> Do not commit real credentials to git. Keep local secrets only in git-ignored `.env` / `.env.local`.

---

## Testing Guide

### 1. Local Static Checks

Verify linting, strict TypeScript checking, Prisma generation, and the Next.js production build locally:

```bash
npm install
npx prisma generate
npm run lint
npm run build
```

### 2. Provision & Seed PayPal Sandbox Accounts (Optional Test Data)

To populate Sandbox test accounts and realistic transactions for multi-user split testing:

1. Generate the git-ignored `sandbox-users.csv` roster:
   ```bash
   SANDBOX_DEFAULT_PASSWORD="YourStrongPassword123!" npm run csv:paypal
   ```
   Upload `sandbox-users.csv` in **PayPal Developer Dashboard -> Sandbox -> Accounts -> Bulk create accounts**.
2. Populate Sandbox invoices and local/Neon DB records against `.env.local`:
   ```bash
   npm run seed:paypal
   ```
   To clear seeded Sandbox invoices and test records later:
   ```bash
   npm run clean:paypal
   ```

### 3. End-to-End Verification Checklist (Live Render Deployment)

Test with at least two separate Sandbox Business accounts (e.g. an organizer and a friend/debtor) in separate browser profiles or incognito windows:

1. **Authentication & First-Time Profile Binding**:
   - Click **Log in with PayPal** on the organizer account.
   - If the PayPal Platform app omits the `email` claim from `/userinfo`, the modal prompts once for your **PayPal Sandbox Email** (`Enter your email`) and **Display Name** (`Enter your name`), storing `paypalOAuthId` on the user record so subsequent logins authenticate directly.
   - Optionally click **Connect PayPal Direct** in the header to complete Partner Referrals onboarding (`paypalOnboardingStatus = CONNECTED`) for direct-payee Checkout routing.

2. **Ledger Sync & Categorization**:
   - Confirm transactions sync into **Live Financial Ledger** (click **Sync PayPal** if needed).
   - Categorize an uncategorized transaction from chat (`This item` / `This vendor` / `All similar`), the Review popup, or inline grid editing.
   - Verify the chat triage card locks to its categorized confirmation and does not revert to active buttons after reloading the page or switching threads.

3. **Expense Split Creation & Source Category Inheritance**:
   - Ensure the source expense (e.g., a hotel charge) has a non-`Uncategorized` category (such as `Travel`).
   - Ask PocketMate in chat to split that expense across participants (including differential amounts/notes if needed).
   - Review/edit allocations in the interactive split card and confirm dispatch.
   - Verify real PayPal invoices are created (`SplitRecord`, `SplitItem`) and the split rows on the organizer's ledger inherit the parent transaction's category (e.g., `Travel`).

4. **Incoming Invoice Payment (`Pay in Full` / `Pay in 4`) & Chat Card State**:
   - Log in as Participant 1 in an incognito window.
   - Open **Action Required -> Pending Debt -> Settle via PayPal**.
   - Click **Pay in Full** (redirects to PayPal Sandbox Checkout — supports standard PayPal balance or **Pay in 4** installment checkout when eligible; PayPal settles the full capture upfront to the organizer).
   - After returning to the app (`/?order_status=approved`), verify the ledger row shows **Paid**, **Pending Debt** clears, and the chat card shows **Invoice Paid** instead of **Pay in Full / Decline**.

5. **Declining an Invoice, `Action Required` Triage, & Category Preservation on Ask Again**:
   - Log in as Participant 2, open the incoming invoice review card, and click **Decline** with a brief reason (e.g., requesting a lower amount).
   - Switch back to the organizer's session and check **Action Required**: verify the declined notice appears with **Dismiss** and **Ask Again**.
   - Click **Ask Again**, enter the adjusted amount (and optional note), and click **Send Invoice**.
   - Confirm a new PayPal invoice is dispatched, the declined alert clears from **Action Required**, and the newly created split invoice inherits the category of the previously asked invoice.
   - Test **Dismiss** on another declined item and reload to verify dismissal persists in PostgreSQL.

6. **Webhooks & Recurring Calendar**:
   - Pay an invoice directly in PayPal Sandbox UI or wait for a webhook event and confirm `/api/paypal/webhook` updates `SplitItem` and `LedgerTransaction` status.
   - Open **Upcoming & Due** and verify settled recurring subscriptions (e.g., Netflix, Google Cloud, Spotify) show accurate per-month completion status without displaying future billing dates before subscription start dates.

7. **Receipt Audit**:
   - Upload a receipt image in chat via the attachment control and confirm line items, tax/tip totals, and any mismatch summary against recent ledger charges.

---

## License

This project is licensed under the [MIT License](LICENSE).
