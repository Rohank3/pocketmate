/**
 * Generates git-ignored `sandbox-users.csv` for PayPal Developer Dashboard Bulk Account Import.
 * All 18 accounts are provisioned as BUSINESS Sandbox accounts with fresh names and emails.
 *
 * Password resolution:
 * - Reads SANDBOX_DEFAULT_PASSWORD from .env.local / .env if provided (min 8 chars).
 * - Otherwise generates a runtime random PayPal-compliant password (never hardcoded in git).
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export interface SandboxCsvUser {
  countryCode: string;
  accountType: "BUSINESS";
  email: string;
  firstName: string;
  lastName: string;
  ppBalance: number;
  addBank: "Y" | "N";
  ccType: "VISA" | "MASTERCARD" | "AMEX" | "DISCOVER";
  paymentCard: "PAYPAL" | "DISCOVER";
}

export const SANDBOX_BUSINESS_ROSTER: readonly SandboxCsvUser[] = [
  // Cluster 1: Social & Expense-Split Circle (Primary Test User + 4 Friends)
  { countryCode: "US", accountType: "BUSINESS", email: "ethan.carter.pm@business.example.com", firstName: "Ethan", lastName: "Carter", ppBalance: 3650, addBank: "Y", ccType: "VISA", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "noah.bennett.pm@business.example.com", firstName: "Noah", lastName: "Bennett", ppBalance: 480, addBank: "Y", ccType: "MASTERCARD", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "caleb.foster.pm@business.example.com", firstName: "Caleb", lastName: "Foster", ppBalance: 720, addBank: "Y", ccType: "VISA", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "owen.brooks.pm@business.example.com", firstName: "Owen", lastName: "Brooks", ppBalance: 510, addBank: "Y", ccType: "VISA", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "maya.patel.pm@business.example.com", firstName: "Maya", lastName: "Patel", ppBalance: 890, addBank: "Y", ccType: "AMEX", paymentCard: "PAYPAL" },

  // Cluster 2: B2B Freelance & Agency Rails
  { countryCode: "US", accountType: "BUSINESS", email: "vertex.supply.us@business.example.com", firstName: "Vertex", lastName: "Supply", ppBalance: 8500, addBank: "Y", ccType: "VISA", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "claire.hayes.studio@business.example.com", firstName: "Claire", lastName: "Hayes", ppBalance: 7500, addBank: "Y", ccType: "MASTERCARD", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "nadia.kowalski.tech@business.example.com", firstName: "Nadia", lastName: "Kowalski", ppBalance: 9400, addBank: "Y", ccType: "MASTERCARD", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "julian.mercer.design@business.example.com", firstName: "Julian", lastName: "Mercer", ppBalance: 6200, addBank: "Y", ccType: "MASTERCARD", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "victor.lin.ventures@business.example.com", firstName: "Victor", lastName: "Lin", ppBalance: 9800, addBank: "Y", ccType: "VISA", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "felix.lindqvist.dev@business.example.com", firstName: "Felix", lastName: "Lindqvist", ppBalance: 1800, addBank: "Y", ccType: "VISA", paymentCard: "PAYPAL" },

  // Cluster 3: Hospitality, Executive & Logistics
  { countryCode: "US", accountType: "BUSINESS", email: "henri.laurent.bistro@business.example.com", firstName: "Henri", lastName: "Laurent", ppBalance: 5750, addBank: "Y", ccType: "MASTERCARD", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "rachel.kim.exec@business.example.com", firstName: "Rachel", lastName: "Kim", ppBalance: 8200, addBank: "Y", ccType: "AMEX", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "bram.devries.freight@business.example.com", firstName: "Bram", lastName: "DeVries", ppBalance: 8900, addBank: "Y", ccType: "MASTERCARD", paymentCard: "PAYPAL" },

  // Cluster 4: Isolated Archetypes
  { countryCode: "US", accountType: "BUSINESS", email: "amelie.girard.art@business.example.com", firstName: "Amelie", lastName: "Girard", ppBalance: 3100, addBank: "Y", ccType: "VISA", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "gavin.oconnor.audio@business.example.com", firstName: "Gavin", lastName: "OConnor", ppBalance: 520, addBank: "Y", ccType: "VISA", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "haruto.tanaka.media@business.example.com", firstName: "Haruto", lastName: "Tanaka", ppBalance: 4500, addBank: "Y", ccType: "VISA", paymentCard: "PAYPAL" },
  { countryCode: "US", accountType: "BUSINESS", email: "matteo.conti.tours@business.example.com", firstName: "Matteo", lastName: "Conti", ppBalance: 2400, addBank: "Y", ccType: "VISA", paymentCard: "DISCOVER" },
];

function resolveCsvPassword(): { password: string; source: "env" | "generated" } {
  const configured = process.env.SANDBOX_DEFAULT_PASSWORD?.trim();
  if (configured && configured.length >= 8) {
    return { password: configured, source: "env" };
  }
  const randomPart = crypto.randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "x");
  return { password: `Pm9!${randomPart}`, source: "generated" };
}

function main() {
  const { password, source } = resolveCsvPassword();
  const header = "country_code,account_type,primary_email_alias,password,first_name,last_name,ppBalance,addBank,ccType,payment_card";
  const rows = SANDBOX_BUSINESS_ROSTER.map((u) =>
    [
      u.countryCode,
      u.accountType,
      u.email,
      password,
      u.firstName,
      u.lastName,
      u.ppBalance,
      u.addBank,
      u.ccType,
      u.paymentCard,
    ].join(",")
  );

  const outPath = path.resolve(process.cwd(), "sandbox-users.csv");
  fs.writeFileSync(outPath, [header, ...rows, ""].join("\n"), "utf8");

  console.log(`Generated ${SANDBOX_BUSINESS_ROSTER.length} BUSINESS accounts in ${outPath}`);
  console.log(`Password source: ${source === "env" ? "SANDBOX_DEFAULT_PASSWORD" : "runtime-generated (stored inside git-ignored sandbox-users.csv)"}`);
}

main();
