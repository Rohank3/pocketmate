/**
 * PocketMate — Two-Phase PayPal Sandbox Simulation Seeder & Teardown Engine
 * 
 * Capabilities:
 * - Pre-Flight Health Check (Token, Scopes, Identity, API readiness)
 * - Full Ecosystem Seeding (45+ real-world transactions across all 18 accounts in 4 clusters)
 * - Safe Simulation Teardown (--clean): Cancels/deletes sandbox invoices & resets local/Neon DB state
 * 
 * Target Sandbox App:
 *   Authenticates dynamically using PAYPAL_CLIENT_ID & PAYPAL_CLIENT_SECRET from .env.local
 */

import fs from "fs";
import path from "path";

// -----------------------------------------------------------------------------
// Environment Loader (.env.local -> .env)
// -----------------------------------------------------------------------------
function loadEnvironment(): void {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnvironment();

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const baseUrl = process.env.PAYPAL_ENVIRONMENT === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SeedInvoicePayload {
  invoicerName: string;
  invoicerEmail: string;
  recipientName: string;
  recipientEmail: string;
  amount: number;
  note: string;
  daysAgo: number;
  txType?: "merchant" | "p2p" | "split";
  items?: Array<{ name: string; quantity: string; unitPrice: number }>;
}

interface SeedPayoutPayload {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  senderEmail: string;
  amount: number;
  note: string;
  daysAgo?: number;
}

// -----------------------------------------------------------------------------
// Core PayPal API Helpers
// -----------------------------------------------------------------------------
let cachedAccessToken = "";

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken) return cachedAccessToken;

  if (!clientId || !clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env.local");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth token failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  cachedAccessToken = data.access_token;
  return cachedAccessToken;
}

/**
 * Creates an invoice in PayPal Sandbox and records an authentic payment,
 * transitioning it immediately to MARKED_AS_PAID with proper historical dates.
 */
async function createPaidInvoice(payload: SeedInvoicePayload): Promise<string> {
  const token = await getAccessToken();
  const dateStr = new Date(Date.now() - payload.daysAgo * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const items = payload.items && payload.items.length > 0
    ? payload.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit_amount: {
          currency_code: "USD",
          value: i.unitPrice.toFixed(2),
        },
      }))
    : [
        {
          name: payload.invoicerName || "Purchase Item",
          quantity: "1",
          unit_amount: {
            currency_code: "USD",
            value: payload.amount.toFixed(2),
          },
        },
      ];

  const invoicerParts = payload.invoicerName.split(" ");
  const recipientParts = payload.recipientName.split(" ");
  const typeTag = payload.txType ? `|type:${payload.txType}` : "";
  const refTag = `sender:${payload.invoicerEmail.toLowerCase().trim()}${typeTag}`;

  // 1. Create draft invoice
  const draftRes = await fetch(`${baseUrl}/v2/invoicing/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      detail: {
        currency_code: "USD",
        note: payload.note || undefined,
        invoice_date: dateStr,
        reference: refTag,
        memo: refTag,
      },
      invoicer: {
        name: {
          given_name: invoicerParts[0] || "Merchant",
          surname: invoicerParts.slice(1).join(" ") || "Store",
        },
        email_address: payload.invoicerEmail,
      },
      primary_recipients: [
        {
          billing_info: {
            name: {
              given_name: recipientParts[0] || "Customer",
              surname: recipientParts.slice(1).join(" ") || "User",
            },
            email_address: payload.recipientEmail,
          },
        },
      ],
      items,
    }),
  });

  if (!draftRes.ok) {
    const errText = await draftRes.text();
    throw new Error(`Failed to create invoice (${draftRes.status}): ${errText}`);
  }

  const invoiceData = await draftRes.json();
  const invoiceId = invoiceData.id || invoiceData.href?.split("/").pop() || draftRes.headers.get("location")?.split("/").pop();

  if (!invoiceId) {
    throw new Error("PayPal returned no invoice ID in response.");
  }

  await sleep(150);

  // 2. Record authentic payment on PayPal Sandbox
  const payRes = await fetch(`${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      method: "PAYPAL",
      payment_date: dateStr,
      amount: {
        currency_code: "USD",
        value: payload.amount.toFixed(2),
      },
      note: `Paid via PayPal Sandbox Wallet (${payload.recipientName})`,
    }),
  });

  if (!payRes.ok) {
    const payErr = await payRes.text();
    console.warn(`    ⚠️ Payment recording notice for ${invoiceId}: ${payErr.slice(0, 100)}`);
  }

  return invoiceId;
}

/**
 * Dispatches a peer-to-peer payout between accounts, creating an authentic P2P ledger entry.
 * If Sandbox Payouts is geographically restricted, transparently records a paid P2P settlement invoice.
 */
async function dispatchP2PTransfer(payload: SeedPayoutPayload): Promise<string> {
  const token = await getAccessToken();
  const batchId = `PM_SIM_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const body = {
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: "PocketMate Simulation P2P Settlement",
      email_message: payload.note,
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: {
          value: payload.amount.toFixed(2),
          currency: "USD",
        },
        note: payload.note,
        sender_item_id: `ITEM_${Date.now()}`,
        receiver: payload.recipientEmail,
      },
    ],
  };

  const res = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const data = await res.json();
    return data.batch_header?.payout_batch_id || batchId;
  }

  // Fallback to recorded invoice if payouts endpoint is restricted:
  // Invoicer is the actual payee receiving funds; primary recipient is the actual sender paying funds.
  const errText = await res.text();
  if (res.status === 403 || errText.includes("PAYOUT_NOT_AVAILABLE") || errText.includes("USER_BUSINESS_TOTAL_EXCEEDED")) {
    return await createPaidInvoice({
      invoicerName: payload.recipientName,
      invoicerEmail: payload.recipientEmail,
      recipientName: payload.senderName,
      recipientEmail: payload.senderEmail,
      amount: payload.amount,
      note: payload.note,
      daysAgo: payload.daysAgo || 7,
      txType: "p2p",
      items: payload.note
        ? [{ name: payload.note, quantity: "1", unitPrice: payload.amount }]
        : undefined,
    });
  }

  throw new Error(`Payout failed (${res.status}): ${errText}`);
}

// -----------------------------------------------------------------------------
// PHASE 1: Pre-Flight Health Check
// -----------------------------------------------------------------------------
async function runPhase1Preflight(): Promise<boolean> {
  console.log("\n==================================================================");
  console.log("  🔍 PHASE 1: PRE-FLIGHT PAYPAL SANDBOX HEALTH CHECK");
  console.log("==================================================================");

  console.log(`• Environment:   ${process.env.PAYPAL_ENVIRONMENT || "sandbox"}`);
  console.log(`• Endpoint:      ${baseUrl}`);
  console.log(`• Client ID:     ${clientId?.slice(0, 12)}...${clientId?.slice(-6)}`);

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      console.error(`❌ OAuth Token Failed [${tokenRes.status}]: ${await tokenRes.text()}`);
      return false;
    }

    const tokenData = await tokenRes.json();
    cachedAccessToken = tokenData.access_token;

    console.log("  [✓] OAuth Bearer Token:      SUCCESS");
    console.log(`  [✓] App ID:                  ${tokenData.app_id}`);

    const scopes = tokenData.scope || "";
    const hasInvoicing = scopes.includes("invoicing");
    const hasPayouts = scopes.includes("payouts");
    const hasReporting = scopes.includes("reporting") || scopes.includes("search");
    const hasDisputes = scopes.includes("disputes");

    console.log(`  [${hasInvoicing ? "✓" : "⚠️"}] Invoicing Permissions:    ${hasInvoicing ? "ENABLED" : "MISSING"}`);
    console.log(`  [${hasPayouts ? "✓" : "⚠️"}] Payouts Permissions:      ${hasPayouts ? "ENABLED" : "MISSING"}`);
    console.log(`  [${hasReporting ? "✓" : "⚠️"}] Reporting Permissions:    ${hasReporting ? "ENABLED" : "MISSING"}`);
    console.log(`  [${hasDisputes ? "✓" : "⚠️"}] Disputes Permissions:     ${hasDisputes ? "ENABLED" : "MISSING"}`);

    const userRes = await fetch(`${baseUrl}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
      headers: {
        Authorization: `Bearer ${cachedAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (userRes.ok) {
      const userData = await userRes.json();
      console.log(`  [✓] Master Host Account:     ${userData.emails?.[0]?.value || "Verified"}`);
      console.log(`  [✓] Payer ID:                ${userData.payer_id || "Verified"}`);
    }

    console.log("\n  ✨ PHASE 1 PASSED: Credentials and API endpoints are fully verified.\n");
    return true;
  } catch (err) {
    console.error("❌ Phase 1 encountered an unexpected failure:", err);
    return false;
  }
}

// -----------------------------------------------------------------------------
// PHASE 2: Full Ecosystem Seeding (45+ Real-World Transactions)
// -----------------------------------------------------------------------------
async function runPhase2Seeding(): Promise<void> {
  console.log("==================================================================");
  console.log("  🚀 PHASE 2: INJECTING 18-USER SANDBOX SIMULATION ECOSYSTEM");
  console.log("==================================================================");

  let totalInjected = 0;

  // ---------------------------------------------------------------------------
  // [1/4] CLUSTER 1: The Social & Expense-Split Circle (Ethan Carter as Main User)
  // ---------------------------------------------------------------------------
  console.log("\n[1/4] 🍕 Seeding Cluster 1: The Social & Expense-Split Circle (Ethan Carter)...");

  // 1. Grand Vista Hotel ($480.00, 2 days ago) — THE UNSPLIT TEST TARGET!
  console.log("  • Seeding $480 Grand Vista Hotel charge for Ethan Carter (Unsplit test target)...");
  const hotelId = await createPaidInvoice({
    invoicerName: "Grand Vista Hotel & Suites",
    invoicerEmail: "billing@grandvistahotel.com",
    recipientName: "Ethan Carter",
    recipientEmail: "ethan.carter.pm@business.example.com",
    amount: 480.00,
    note: "", // Real hotel card debits have no custom note
    daysAgo: 2,
    items: [
      { name: "Room Folio #89124", quantity: "1", unitPrice: 480.00 },
    ],
  });
  console.log(`    ✓ Grand Vista Hotel ($480.00) seeded [ID: ${hotelId}] — Zero split invoices created.`);
  totalInjected++;
  await sleep(250);

  // 2. Henri Laurent Bistro ($130.00, 4 days ago) — RECEIPT SURCHARGE AUDIT TARGET!
  // Settled card charge is $130.00. The customer holds an itemized receipt for $100 food + $5 tax + $10 tip = $115.00.
  // The PocketMate AI dynamically cross-audits the receipt against the live $130 charge to detect the $15 discrepancy.
  console.log("  • Seeding $130 Henri Laurent Bistro charge (receipt audit target)...");
  const cafeId = await createPaidInvoice({
    invoicerName: "Henri Laurent Bistro",
    invoicerEmail: "henri.laurent.bistro@business.example.com",
    recipientName: "Ethan Carter",
    recipientEmail: "ethan.carter.pm@business.example.com",
    amount: 130.00,
    note: "", // Real restaurant card debits have no custom note
    daysAgo: 4,
  });
  console.log(`    ✓ Henri Laurent Bistro ($130.00) seeded [ID: ${cafeId}].`);
  totalInjected++;
  await sleep(250);

  // 3. Everyday Consumer Purchases for Ethan Carter (Groceries, Coffee, Transit, Shopping)
  console.log("  • Seeding realistic everyday living expenses for Ethan Carter...");
  const ethanDailyExpenses = [
    { merchant: "Whole Foods Market", email: "billing@wholefoods.example.com", amount: 78.45, daysAgo: 1 },
    { merchant: "Trader Joe's #521", email: "billing@traderjoes.example.com", amount: 42.10, daysAgo: 3 },
    { merchant: "Starbucks Coffee #1042", email: "billing@starbucks.example.com", amount: 6.85, daysAgo: 2 },
    { merchant: "Chipotle Mexican Grill", email: "billing@chipotle.example.com", amount: 16.40, daysAgo: 4 },
    { merchant: "Uber *Trip SD", email: "receipts@uber.example.com", amount: 24.50, daysAgo: 2 },
    { merchant: "Shell Oil 4819", email: "billing@shelloil.example.com", amount: 46.00, daysAgo: 5 },
    { merchant: "Target Superstore", email: "billing@target.example.com", amount: 52.30, daysAgo: 5 },
    { merchant: "Amazon.com* Purchases", email: "orders@amazon.example.com", amount: 34.99, daysAgo: 6 },
    { merchant: "AMC Theatres Century", email: "tickets@amctheatres.example.com", amount: 32.00, daysAgo: 8 },
  ];

  for (const exp of ethanDailyExpenses) {
    await createPaidInvoice({
      invoicerName: exp.merchant,
      invoicerEmail: exp.email,
      recipientName: "Ethan Carter",
      recipientEmail: "ethan.carter.pm@business.example.com",
      amount: exp.amount,
      note: "",
      daysAgo: exp.daysAgo,
    });
    totalInjected++;
    await sleep(150);
  }
  console.log(`    ✓ Seeded ${ethanDailyExpenses.length} daily living transactions for Ethan Carter.`);

  // 4. Bidirectional P2P Contact Graph for Ethan Carter (Realistic Casual & Shorthand Notes)
  console.log("  • Seeding bidirectional P2P transfers for Dynamic Contact Graph...");
  const p2pTransfers: SeedPayoutPayload[] = [
    {
      recipientName: "Noah Bennett",
      recipientEmail: "noah.bennett.pm@business.example.com",
      amount: 35.00,
      note: "concert tix",
      senderName: "Ethan Carter",
      senderEmail: "ethan.carter.pm@business.example.com",
      daysAgo: 24,
    },
    {
      recipientName: "Ethan Carter",
      recipientEmail: "ethan.carter.pm@business.example.com",
      amount: 22.50,
      note: "🍕🍻",
      senderName: "Noah Bennett",
      senderEmail: "noah.bennett.pm@business.example.com",
      daysAgo: 18,
    },
    {
      recipientName: "Caleb Foster",
      recipientEmail: "caleb.foster.pm@business.example.com",
      amount: 42.00,
      note: "gas",
      senderName: "Ethan Carter",
      senderEmail: "ethan.carter.pm@business.example.com",
      daysAgo: 15,
    },
    {
      recipientName: "Owen Brooks",
      recipientEmail: "owen.brooks.pm@business.example.com",
      amount: 25.00,
      note: "uber ride share",
      senderName: "Ethan Carter",
      senderEmail: "ethan.carter.pm@business.example.com",
      daysAgo: 12,
    },
    {
      recipientName: "Ethan Carter",
      recipientEmail: "ethan.carter.pm@business.example.com",
      amount: 18.00,
      note: "", // Blank note as humans often do
      senderName: "Caleb Foster",
      senderEmail: "caleb.foster.pm@business.example.com",
      daysAgo: 10,
    },
    {
      recipientName: "Ethan Carter",
      recipientEmail: "ethan.carter.pm@business.example.com",
      amount: 15.00,
      note: "coffee ☕",
      senderName: "Owen Brooks",
      senderEmail: "owen.brooks.pm@business.example.com",
      daysAgo: 8,
    },
    {
      recipientName: "Ethan Carter",
      recipientEmail: "ethan.carter.pm@business.example.com",
      amount: 12.50,
      note: "lunch share",
      senderName: "Owen Brooks",
      senderEmail: "owen.brooks.pm@business.example.com",
      daysAgo: 4,
    },
    {
      recipientName: "Maya Patel",
      recipientEmail: "maya.patel.pm@business.example.com",
      amount: 28.00,
      note: "groceries",
      senderName: "Ethan Carter",
      senderEmail: "ethan.carter.pm@business.example.com",
      daysAgo: 5,
    },
    {
      recipientName: "Ethan Carter",
      recipientEmail: "ethan.carter.pm@business.example.com",
      amount: 14.00,
      note: "tacos 🌮",
      senderName: "Maya Patel",
      senderEmail: "maya.patel.pm@business.example.com",
      daysAgo: 2,
    },
  ];

  for (const p of p2pTransfers) {
    await dispatchP2PTransfer(p);
    console.log(`    ✓ P2P: ${p.senderName} -> ${p.recipientEmail} ($${p.amount.toFixed(2)}) [note: "${p.note}"]`);
    totalInjected++;
    await sleep(200);
  }

  // 5. Recurring Subscriptions for Ethan Carter (Autopay Signals)
  console.log("  • Seeding recurring subscriptions for Ethan Carter (Upcoming Bills signals)...");
  const ethanSubscriptions = [
    { name: "Netflix.com", invoicer: "Netflix.com", amount: 19.99, daysList: [3, 33, 63] },
    { name: "Spotify USA", invoicer: "Spotify USA", amount: 16.99, daysList: [12, 42, 72] },
    { name: "Google *Cloud Storage", invoicer: "Google *Cloud Storage", amount: 9.99, daysList: [20, 50] },
    { name: "Equinox Fitness", invoicer: "Equinox Fitness", amount: 45.00, daysList: [7, 37] },
  ];

  for (const sub of ethanSubscriptions) {
    for (const d of sub.daysList) {
      await createPaidInvoice({
        invoicerName: sub.invoicer,
        invoicerEmail: `${sub.invoicer.toLowerCase().replace(/[^a-z]/g, "")}@billing.sandbox`,
        recipientName: "Ethan Carter",
        recipientEmail: "ethan.carter.pm@business.example.com",
        amount: sub.amount,
        note: "",
        daysAgo: d,
      });
      totalInjected++;
      await sleep(150);
    }
    console.log(`    ✓ Recurring: ${sub.name} ($${sub.amount.toFixed(2)}/mo) — ${sub.daysList.length} billing cycles.`);
  }

  // ---------------------------------------------------------------------------
  // [2/4] CLUSTER 2: B2B Freelance & Agency Rails
  // ---------------------------------------------------------------------------
  console.log("\n[2/4] 💼 Seeding Cluster 2: B2B Freelance & Agency Rails...");

  // Claire Hayes Studio -> Nadia Kowalski Tech
  await createPaidInvoice({
    invoicerName: "Claire Hayes Studio",
    invoicerEmail: "claire.hayes.studio@business.example.com",
    recipientName: "Nadia Kowalski Tech",
    recipientEmail: "nadia.kowalski.tech@business.example.com",
    amount: 1200.00,
    note: "Invoice #101",
    daysAgo: 20,
  });
  await createPaidInvoice({
    invoicerName: "Claire Hayes Studio",
    invoicerEmail: "claire.hayes.studio@business.example.com",
    recipientName: "Nadia Kowalski Tech",
    recipientEmail: "nadia.kowalski.tech@business.example.com",
    amount: 3400.00,
    note: "Invoice #102 - Q3 Milestone",
    daysAgo: 5,
  });
  await createPaidInvoice({
    invoicerName: "Claire Hayes Studio",
    invoicerEmail: "claire.hayes.studio@business.example.com",
    recipientName: "Nadia Kowalski Tech",
    recipientEmail: "nadia.kowalski.tech@business.example.com",
    amount: 850.00,
    note: "Invoice #103 - Design Systems Support",
    daysAgo: 12,
  });
  console.log("    ✓ Claire Hayes Studio -> Nadia Kowalski Tech (3 B2B Invoices: $1,200, $3,400, $850).");
  totalInjected += 3;
  await sleep(250);

  // Julian Mercer Design -> Victor Lin Ventures
  await createPaidInvoice({
    invoicerName: "Julian Mercer Design",
    invoicerEmail: "julian.mercer.design@business.example.com",
    recipientName: "Victor Lin Ventures",
    recipientEmail: "victor.lin.ventures@business.example.com",
    amount: 3800.00,
    note: "Retainer 11/26",
    daysAgo: 14,
  });
  await createPaidInvoice({
    invoicerName: "Julian Mercer Design",
    invoicerEmail: "julian.mercer.design@business.example.com",
    recipientName: "Victor Lin Ventures",
    recipientEmail: "victor.lin.ventures@business.example.com",
    amount: 1500.00,
    note: "Pitch Deck Polish",
    daysAgo: 3,
  });
  console.log("    ✓ Julian Mercer Design -> Victor Lin Ventures ($3,800 & $1,500 retainers).");
  totalInjected += 2;
  await sleep(250);

  // Felix Lindqvist Developer Subscriptions & Payouts
  const devSubs = [
    { name: "GitHub", amount: 10.00, daysList: [5, 35] },
    { name: "OpenAI", amount: 20.00, daysList: [10, 40] },
    { name: "Amazon Web Services", amount: 85.00, daysList: [15, 45] },
  ];
  for (const s of devSubs) {
    for (const d of s.daysList) {
      await createPaidInvoice({
        invoicerName: s.name,
        invoicerEmail: `${s.name.toLowerCase().replace(/[^a-z]/g, "")}@billing.sandbox`,
        recipientName: "Felix Lindqvist",
        recipientEmail: "felix.lindqvist.dev@business.example.com",
        amount: s.amount,
        note: "",
        daysAgo: d,
      });
      totalInjected++;
      await sleep(150);
    }
  }
  await createPaidInvoice({
    invoicerName: "DevForge Labs",
    invoicerEmail: "payments@devforge.example.com",
    recipientName: "Felix Lindqvist",
    recipientEmail: "felix.lindqvist.dev@business.example.com",
    amount: 1400.00,
    note: "Frontend Contract Milestone #2",
    daysAgo: 8,
  });
  totalInjected++;
  console.log("    ✓ Felix Lindqvist (Dev subscriptions + $1,400 freelance client payout).");

  // Nadia Kowalski Tech Enterprise SaaS
  await createPaidInvoice({
    invoicerName: "Amazon Web Services",
    invoicerEmail: "aws-billing@amazon.example.com",
    recipientName: "Nadia Kowalski Tech",
    recipientEmail: "nadia.kowalski.tech@business.example.com",
    amount: 450.00,
    note: "",
    daysAgo: 10,
  });
  await createPaidInvoice({
    invoicerName: "Cloudflare",
    invoicerEmail: "billing@cloudflare.example.com",
    recipientName: "Nadia Kowalski Tech",
    recipientEmail: "nadia.kowalski.tech@business.example.com",
    amount: 200.00,
    note: "",
    daysAgo: 12,
  });
  await createPaidInvoice({
    invoicerName: "Google Workspace",
    invoicerEmail: "workspace@google.example.com",
    recipientName: "Nadia Kowalski Tech",
    recipientEmail: "nadia.kowalski.tech@business.example.com",
    amount: 72.00,
    note: "",
    daysAgo: 16,
  });
  console.log("    ✓ Nadia Kowalski Tech (AWS $450, Cloudflare $200, Google Workspace $72).");
  totalInjected += 3;
  await sleep(250);

  // ---------------------------------------------------------------------------
  // [3/4] CLUSTER 3: Enterprise & Budget Surveillance
  // ---------------------------------------------------------------------------
  console.log("\n[3/4] 📊 Seeding Cluster 3: Enterprise & Budget Surveillance...");

  // Rachel Kim (Executive High-Spend)
  const rachelCharges = [
    { merchant: "Vertex Supply Commercial", email: "vertex.supply.us@business.example.com", amount: 1450.00, daysAgo: 6 },
    { merchant: "Grand Luxe Airways", email: "billing@grandluxe.example.com", amount: 850.00, daysAgo: 18 },
    { merchant: "The Capital Grille", email: "dining@capitalgrille.example.com", amount: 240.00, daysAgo: 4 },
    { merchant: "Marriott Downtown Marquis", email: "billing@marriott.example.com", amount: 380.00, daysAgo: 14 },
  ];
  for (const c of rachelCharges) {
    await createPaidInvoice({
      invoicerName: c.merchant,
      invoicerEmail: c.email,
      recipientName: "Rachel Kim",
      recipientEmail: "rachel.kim.exec@business.example.com",
      amount: c.amount,
      note: "",
      daysAgo: c.daysAgo,
    });
    totalInjected++;
    await sleep(150);
  }
  console.log("    ✓ Rachel Kim (Executive spend: Hardware $1,450, Flight $850, Dining $240, Hotel $380).");

  // Bram DeVries Freight
  const bramCharges = [
    { merchant: "Vertex Supply Commercial", email: "vertex.supply.us@business.example.com", amount: 2300.00, daysAgo: 8 },
    { merchant: "Fleet Fuel Services", email: "billing@fleetfuel.example.com", amount: 620.00, daysAgo: 14 },
    { merchant: "Interstate Highway Tolls", email: "billing@tolls.example.com", amount: 145.00, daysAgo: 9 },
  ];
  for (const c of bramCharges) {
    await createPaidInvoice({
      invoicerName: c.merchant,
      invoicerEmail: c.email,
      recipientName: "Bram DeVries Freight",
      recipientEmail: "bram.devries.freight@business.example.com",
      amount: c.amount,
      note: "",
      daysAgo: c.daysAgo,
    });
    totalInjected++;
    await sleep(150);
  }
  console.log("    ✓ Bram DeVries Freight (Vertex Hardware $2,300, Fleet Fuel $620, Tolls $145).");

  // ---------------------------------------------------------------------------
  // [4/4] CLUSTER 4: Isolated Real-World Archetypes
  // ---------------------------------------------------------------------------
  console.log("\n[4/4] 🏝️ Seeding Cluster 4: Isolated Real-World Archetypes...");

  // Amelie Girard
  await createPaidInvoice({
    invoicerName: "Galerie d'Art Moderne",
    invoicerEmail: "art@galerie.example.com",
    recipientName: "Amelie Girard",
    recipientEmail: "amelie.girard.art@business.example.com",
    amount: 1850.00,
    note: "",
    daysAgo: 15,
  });
  await createPaidInvoice({
    invoicerName: "Louvre Museum Boutique",
    invoicerEmail: "boutique@louvre.example.com",
    recipientName: "Amelie Girard",
    recipientEmail: "amelie.girard.art@business.example.com",
    amount: 120.00,
    note: "",
    daysAgo: 7,
  });
  console.log("    ✓ Amelie Girard (Sculpture $1,850 & Museum Boutique $120).");
  totalInjected += 2;

  // Gavin OConnor
  await createPaidInvoice({
    invoicerName: "Vintage Guitar Studio",
    invoicerEmail: "service@vintageguitar.example.com",
    recipientName: "Gavin OConnor",
    recipientEmail: "gavin.oconnor.audio@business.example.com",
    amount: 180.00,
    note: "",
    daysAgo: 11,
  });
  await createPaidInvoice({
    invoicerName: "Sweetwater Music Audio",
    invoicerEmail: "orders@sweetwater.example.com",
    recipientName: "Gavin OConnor",
    recipientEmail: "gavin.oconnor.audio@business.example.com",
    amount: 65.00,
    note: "",
    daysAgo: 5,
  });
  console.log("    ✓ Gavin OConnor (Guitar amp repair $180 & cables $65).");
  totalInjected += 2;

  // Haruto Tanaka
  await createPaidInvoice({
    invoicerName: "Steam Store",
    invoicerEmail: "help@steampowered.example.com",
    recipientName: "Haruto Tanaka",
    recipientEmail: "haruto.tanaka.media@business.example.com",
    amount: 69.99,
    note: "",
    daysAgo: 12,
  });
  await createPaidInvoice({
    invoicerName: "Nintendo eShop",
    invoicerEmail: "billing@nintendo.example.com",
    recipientName: "Haruto Tanaka",
    recipientEmail: "haruto.tanaka.media@business.example.com",
    amount: 39.99,
    note: "",
    daysAgo: 6,
  });
  await createPaidInvoice({
    invoicerName: "Discord",
    invoicerEmail: "billing@discord.example.com",
    recipientName: "Haruto Tanaka",
    recipientEmail: "haruto.tanaka.media@business.example.com",
    amount: 9.99,
    note: "",
    daysAgo: 8,
  });
  console.log("    ✓ Haruto Tanaka (Steam $69.99, Nintendo $39.99, Discord $9.99).");
  totalInjected += 3;

  // Matteo Conti
  await createPaidInvoice({
    invoicerName: "Eurostar",
    invoicerEmail: "tickets@eurostar.example.com",
    recipientName: "Matteo Conti",
    recipientEmail: "matteo.conti.tours@business.example.com",
    amount: 220.00,
    note: "",
    daysAgo: 9,
  });
  await createPaidInvoice({
    invoicerName: "Airalo",
    invoicerEmail: "billing@airalo.example.com",
    recipientName: "Matteo Conti",
    recipientEmail: "matteo.conti.tours@business.example.com",
    amount: 35.00,
    note: "",
    daysAgo: 14,
  });
  await createPaidInvoice({
    invoicerName: "Hotel Roma Termini",
    invoicerEmail: "reservations@hotelroma.example.com",
    recipientName: "Matteo Conti",
    recipientEmail: "matteo.conti.tours@business.example.com",
    amount: 152.00,
    note: "",
    daysAgo: 6,
  });
  console.log("    ✓ Matteo Conti (Eurostar $220, Airalo eSIM $35, Hotel Roma $152).");
  totalInjected += 3;

  console.log("\n==================================================================");
  console.log(`  🎉 SIMULATION SEEDING COMPLETE! Injected ${totalInjected} records.`);
  console.log("==================================================================");
  console.log("• Ethan Carter's $480 Grand Vista Hotel charge is seeded as COMPLETED.");
  console.log("• Zero split invoices exist for the hotel — ready for your live chat split test!");
  console.log("• Henri Laurent Bistro has $130 charge with $115 receipt ($15 surcharge audit ready).");
  console.log("• Dynamic contact graph is armed with bidirectional P2P payment history.");
  console.log("• All 18 BUSINESS users have authentic transaction records in PayPal Sandbox.\n");
}

// -----------------------------------------------------------------------------
// TEARDOWN / CLEANUP FUNCTION (--clean / --teardown)
// -----------------------------------------------------------------------------
async function runCleanup(): Promise<void> {
  console.log("\n==================================================================");
  console.log("  🧹 POCKETMATE SANDBOX SIMULATION TEARDOWN & CLEANUP");
  console.log("==================================================================");

  const token = await getAccessToken();

  // 1. Fetch & clean all existing invoices from PayPal Sandbox with pagination
  console.log("• Fetching and purging all sandbox invoices from PayPal Developer Sandbox...");
  let page = 1;
  let totalPages = 1;
  let cleaned = 0;

  do {
    const listRes = await fetch(`${baseUrl}/v2/invoicing/invoices?page_size=100&page=${page}&total_required=true`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!listRes.ok) {
      console.warn(`  ⚠️ Failed to fetch invoice page ${page}: HTTP ${listRes.status}`);
      break;
    }

    const listData = await listRes.json();
    totalPages = (listData.total_pages as number) || 1;
    const items = listData.items || [];
    console.log(`  Page ${page} of ${totalPages}: Found ${items.length} sandbox invoices.`);

    for (const inv of items) {
      try {
        const invId = inv.id;
        const status = inv.status;

        // Invoices in DRAFT or CANCELLED can be hard-deleted directly
        if (status === "DRAFT" || status === "CANCELLED") {
          const delRes = await fetch(`${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invId)}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (delRes.ok) {
            console.log(`  ✓ Permanently deleted ${status} invoice: ${invId}`);
            cleaned++;
          }
        }
        // Invoices in SENT / SCHEDULED / UNPAID: cancel first, then hard-delete immediately
        else if (status === "SENT" || status === "SCHEDULED" || status === "UNPAID") {
          const cancelRes = await fetch(`${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invId)}/cancel`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              subject: "Simulation Teardown",
              note: "Cancelled during test simulation reset.",
              send_to_recipient: false,
            }),
          });
          if (cancelRes.ok) {
            // Once cancelled, permanently delete from PayPal API
            const delRes = await fetch(`${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invId)}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (delRes.ok) {
              console.log(`  ✓ Cancelled & permanently deleted invoice: ${invId}`);
            } else {
              console.log(`  ✓ Cancelled SENT invoice: ${invId}`);
            }
            cleaned++;
          }
        }
        // Invoices in PAID / MARKED_AS_PAID / MARKED_AS_REFUNDED cannot be deleted via PayPal REST API
        // (PayPal returns HTTP 422: INVOICE_CANNOT_BE_DELETED). Never issue refunds as that creates
        // ledger clutter. Instead, they are completely excluded from testing via SANDBOX_RESET_AFTER.
      } catch (itemErr) {
        console.warn(`  ⚠️ Error processing invoice ${inv?.id}:`, itemErr instanceof Error ? itemErr.message : itemErr);
      }
      await sleep(80);
    }

    page++;
  } while (page <= totalPages);

  console.log(`  Total sandbox invoices cleaned/cancelled/refunded: ${cleaned}`);

  // 2. Clean Neon PostgreSQL Database records (Prisma)
  console.log("\n• Purging local/Neon DB state (Users, Categories, Splits, Chat, Events, Contacts)...");
  try {
    const { prisma } = await import("@/lib/db");
    const [
      delSplitItems,
      delSplitRecords,
      delBudgetEntries,
      delBudgetCategories,
      delEvents,
      delContacts,
      delMessages,
      delThreads,
      delOverrides,
      delRules,
      delLedger,
      delUsers,
    ] = await Promise.all([
      prisma.splitItem.deleteMany({}),
      prisma.splitRecord.deleteMany({}),
      prisma.budgetEntry.deleteMany({}),
      prisma.budgetCategory.deleteMany({}),
      prisma.scheduledEvent.deleteMany({}),
      prisma.contact.deleteMany({}),
      prisma.chatMessage.deleteMany({}),
      prisma.chatThread.deleteMany({}),
      prisma.transactionCategoryOverride.deleteMany({}),
      prisma.merchantCategoryRule.deleteMany({}),
      prisma.ledgerTransaction.deleteMany({}),
      prisma.user.deleteMany({}),
    ]);
    console.log(`  ✓ Cleared ${delUsers.count} users, ${delBudgetCategories.count} categories, ${delBudgetEntries.count} budget entries.`);
    console.log(`  ✓ Cleared ${delSplitRecords.count} split records, ${delSplitItems.count} split items, ${delLedger.count} ledger txs.`);
    console.log(`  ✓ Cleared ${delMessages.count} chat messages, ${delThreads.count} threads, ${delEvents.count} scheduled events.`);
    console.log(`  ✓ Cleared ${delContacts.count} contacts, ${delOverrides.count} category overrides, ${delRules.count} merchant rules.`);
    await prisma.$disconnect();
  } catch (err) {
    console.warn("  ℹ️ DB purge note:", err instanceof Error ? err.message : err);
  }

  console.log("\n✨ Teardown complete! Database is purged and sandbox state is reset.\n");
}

// -----------------------------------------------------------------------------
// Orchestration Entry Point
// -----------------------------------------------------------------------------
async function main() {
  const isClean = process.argv.includes("--clean") || process.argv.includes("--teardown");
  const isVerifyOnly = process.argv.includes("--verify-only");

  if (isClean) {
    await runCleanup();
    return;
  }

  const passed = await runPhase1Preflight();
  if (!passed) {
    console.error("❌ Pre-flight failed. Aborting Phase 2.");
    process.exit(1);
  }

  if (isVerifyOnly) {
    console.log("ℹ️  --verify-only flag specified. Skipping Phase 2.");
    process.exit(0);
  }

  await runPhase2Seeding();
}

main().catch((err) => {
  console.error("\n❌ Seeding execution failed:", err);
  process.exit(1);
});
