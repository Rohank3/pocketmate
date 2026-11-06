# PocketMate 💸

> **Autonomous Financial Orchestrator & Intelligent Reconciliation Assistant**

PocketMate is an autonomous financial assistant that bridges conversational AI with deterministic transaction rails. Designed around a **Zero-Friction Autonomy** philosophy, PocketMate translates casual human requests into penny-accurate splits, automated PayPal invoicing, proactive budget surveillance, and live dashboard state mutations without requiring manual spreadsheet manipulation.

---

## 🌟 Key Capabilities

### 1. Natural Language Temporal Expense Splitting
- Query transactions using casual temporal windows (*"split all expenses from the last 3 hours across 4 people"*).
- Deterministic penny-locked split math that guarantees allocations sum to the exact cent without floating-point drift.
- Automatic breakdown reporting with itemized venue summaries.

### 2. Autonomous Invoicing & Payment Dispatch
- Direct integration with PayPal Developer APIs for drafting and dispatching itemized invoices and money requests.
- Single-tap confirmation cards for write-actions to ensure strict user control over money movements while keeping friction near zero.

### 3. Intelligent Receipt Auditing (Multimodal Vision)
- Upload paper receipts or digital bills to cross-check itemized charges, taxes, and tips against settled transaction totals.
- Detects hidden surcharges, tip discrepancies, and overbilling before settlements are dispatched.

### 4. Proactive Budget Surveillance
- Monitors monthly burn rates and category limits in real time.
- Proactively flags purchases exceeding category thresholds or breaching monthly caps without waiting for manual ledger review.

### 5. Interactive Ledger & Visual Analytics
- Natural language queries instantly drive data grid states (applying dynamic row grouping, multi-column filters, and analytical views).
- Fast, high-density transactional exploration powered by AG Grid.

### 6. End-of-Day Ambiguity Triage
- Automated sweep identifying untagged or low-confidence transactions.
- Provides concise, non-intrusive categorization prompts to maintain clean financial books.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    User["👤 User Interaction (Chat & Dashboard)"] --> WebApp["Next.js Application Layer"]
    
    subgraph AgentEngine ["🤖 PocketMate Agent Core"]
        ContextStack["Dynamic Context Assembler\n(Persona + Knowledge + History)"]
        GeminiRouter["Model Router\n(Gemini 2.5 Flash / Pro)"]
        ValidationMiddleware["Validation Middleware & Parameter Guards"]
        ToolExecutor["Deterministic Tool Dispatcher"]
        
        ContextStack --> GeminiRouter
        GeminiRouter --> ValidationMiddleware
        ValidationMiddleware --> ToolExecutor
    end
    
    subgraph ExternalRails ["💳 Payment & Settlement Rails"]
        PayPalAPI["PayPal Sandbox REST APIs\n(Invoicing v2, Reporting, Disputes)"]
    end
    
    subgraph Persistence ["🗄️ Persistence & State"]
        NeonDB[("PostgreSQL / Neon\n(User Profiles, Budgets, Ledger)")]
        AGGridState["AG Grid Reactive State Engine"]
    end

    WebApp --> AgentEngine
    ToolExecutor --> PayPalAPI
    ToolExecutor --> NeonDB
    ToolExecutor --> AGGridState
```

---

## 🛠️ Technology Stack

| Domain | Technology |
|---|---|
| **Framework** | [Next.js 14+](https://nextjs.org/) (App Router, Server Actions, Route Handlers) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) (Strict typing throughout) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) (Utility-first responsive design) |
| **Data Grid** | [AG Grid](https://www.ag-grid.com/) (High-performance transactional grids) |
| **AI / Orchestration** | [Google Gemini 2.5](https://ai.google.dev/) (Structured tool calling & multimodal vision) |
| **Payment Platform** | [PayPal Developer APIs](https://developer.paypal.com/) (`@paypal/paypal-server-sdk`) |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/) via [Neon](https://neon.tech/) & [Prisma ORM](https://www.prisma.io/) |

---

## 📁 Repository Structure

```
pocketmate/
├── prisma/
│   └── schema.prisma         # Database schema (Budgets, Profiles, Ledgers)
├── public/                   # Static assets & icons
├── src/
│   ├── app/                  # Next.js App Router (pages & API endpoints)
│   │   ├── api/
│   │   │   ├── agent/        # Agent interaction & SSE streaming routes
│   │   │   └── paypal/       # PayPal webhook & verification endpoints
│   │   ├── dashboard/        # Analytical ledger & grid view
│   │   ├── layout.tsx        # Global layout & provider wraps
│   │   └── page.tsx          # Main conversational workspace
│   ├── components/
│   │   ├── chat/             # Conversational UI & execution stream badges
│   │   ├── grid/             # AG Grid wrapper & custom cell renderers
│   │   ├── cards/            # Action confirmation & receipt audit cards
│   │   └── ui/               # Reusable primitives (buttons, inputs, modals)
│   ├── lib/
│   │   ├── agent/            # Prompt layers, schemas, and tool definitions
│   │   ├── paypal/           # PayPal SDK client & endpoint wrappers
│   │   ├── math/             # Deterministic split algorithms
│   │   └── db.ts             # Prisma database client instance
│   └── types/                # Strict TypeScript interfaces & schemas
├── .env.example              # Sample environment configuration
├── AGENTS.md                 # Agent development guidelines
├── package.json              # Project dependencies & scripts
└── tsconfig.json             # TypeScript compiler settings
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.x` or later (tested on `v24.x`)
- **npm**: `v10.x` or later
- **PostgreSQL**: Neon cloud instance or local PostgreSQL
- **PayPal Developer Account**: Sandbox Client ID & Secret from [developer.paypal.com](https://developer.paypal.com/)
- **Google AI Studio API Key**: From [aistudio.google.com](https://aistudio.google.com/)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Rohank3/pocketmate.git
cd pocketmate
npm install
```

### 2. Configure Environment Variables

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

Populate the required secrets:

```env
# Database
DATABASE_URL="postgresql://user:password@ep-sample.region.neon.tech/pocketmate?sslmode=require"

# Google AI Studio (Gemini)
GEMINI_API_KEY="your-gemini-api-key"

# PayPal Developer Sandbox
PAYPAL_CLIENT_ID="your-sandbox-client-id"
PAYPAL_CLIENT_SECRET="your-sandbox-client-secret"
PAYPAL_ENVIRONMENT="sandbox"

# Application Settings
NEXTAUTH_SECRET="generate-a-secure-random-secret"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Database Initialization

Generate the Prisma client and push the schema to your database:

```bash
npx prisma generate
npx prisma db push
```

### 4. Run the Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to open the PocketMate interface.

---

## 🔒 Reliability & Security Principles

1. **Deterministic Calculations**: Financial computations are strictly isolated in pure, tested TypeScript utility functions. LLMs never compute currency divisions directly.
2. **Read vs. Write Boundaries**: Informational queries, chart configurations, and data lookups are non-destructive and execute autonomously. Fund dispatches and dispute triggers require explicit, single-tap user consent.
3. **Parameter Validation Middleware**: Every tool invocation passes through strict runtime schema validation before touching internal databases or external payment APIs.
4. **Environment Isolation**: Default configurations target the PayPal Sandbox environment to guarantee zero live fund risk during development and testing.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
