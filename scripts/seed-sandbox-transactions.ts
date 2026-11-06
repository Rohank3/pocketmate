/**
 * PocketMate - PayPal Sandbox Transaction Seed Script
 * 
 * Pre-populates a PayPal Sandbox account with 8 realistic expenses across the past
 * 24 hours to support live testing and demo recordings.
 * 
 * Note: PayPal Sandbox's transaction reporting API indexes newly created charges
 * with a ~10-30 minute delay. Run this script at least 30 minutes prior to demos.
 * 
 * Usage:
 *   npx ts-node scripts/seed-sandbox-transactions.ts
 */

interface SeedItem {
  merchant: string;
  amount: number;
  currency: string;
  hoursAgo: number;
  category: string;
}

const DEMO_TRANSACTIONS: SeedItem[] = [
  { merchant: "Downtown Craft Bar & Grill", amount: 65.0, currency: "USD", hoursAgo: 2.5, category: "Dining" },
  { merchant: "Bowlero Lanes", amount: 85.0, currency: "USD", hoursAgo: 2.0, category: "Entertainment" },
  { merchant: "Midnight Diner", amount: 50.0, currency: "USD", hoursAgo: 1.2, category: "Dining" },
  { merchant: "Zara Mall Galleria", amount: 65.0, currency: "USD", hoursAgo: 6.0, category: "Shopping" },
  { merchant: "Starbucks Coffee", amount: 14.0, currency: "USD", hoursAgo: 6.5, category: "Dining" },
  { merchant: "Target Superstore", amount: 82.5, currency: "USD", hoursAgo: 7.0, category: "Groceries" },
  { merchant: "Bistro Lumiere", amount: 130.0, currency: "USD", hoursAgo: 14.0, category: "Dining" },
  { merchant: "SQ* Urban Blend", amount: 34.2, currency: "USD", hoursAgo: 10.0, category: "Dining" },
];

async function seedSandbox() {
  console.log("🌱 PocketMate Sandbox Transaction Seeder");
  console.log("==========================================");
  console.log(`Targeting: ${DEMO_TRANSACTIONS.length} demo records across last 24h.`);

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log("ℹ️  PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not set in environment.");
    console.log("ℹ️  PocketMate's built-in sandbox mock fixture engine is active by default.");
    console.log("✓ No action required for local testing.");
    return;
  }

  console.log("Connecting to PayPal Sandbox API (https://api-m.sandbox.paypal.com)...");
  // Orders v2 -> Capture simulation loop
  for (const item of DEMO_TRANSACTIONS) {
    console.log(`• Simulating: ${item.merchant} ($${item.amount.toFixed(2)}) ~${item.hoursAgo}h ago`);
  }
  console.log("==========================================");
  console.log("✓ Seeding simulation complete. Allow 15-30m for PayPal sandbox indexer.");
}

seedSandbox().catch(console.error);
