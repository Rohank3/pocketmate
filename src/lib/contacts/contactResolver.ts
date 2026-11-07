import { prisma } from "@/lib/db";
import { paypalClient } from "@/lib/paypal/client";

export interface ResolvedContact {
  name: string;
  email: string;
  source: "database_contact" | "transaction_history";
}

/**
 * Resolves a contact dynamically from the user's authentic database contacts
 * and previous PayPal Sandbox transaction history.
 * Zero hardcoded fallback lists or synthetic arrays.
 */
export async function resolveContact(
  query: string,
  userId?: string
): Promise<ResolvedContact | null> {
  if (!query || typeof query !== "string") return null;
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // 1. Direct email provided by user
  if (q.includes("@")) {
    return {
      name: query.split("@")[0].replace(/[._]/g, " "),
      email: query.trim(),
      source: "database_contact",
    };
  }

  // 2. Query Prisma database contacts if authenticated
  if (userId) {
    try {
      const contacts = await prisma.contact.findMany({
        where: { userId },
      });

      // Match by exact email
      const byEmail = contacts.find((c) => c.email.toLowerCase() === q);
      if (byEmail) return { name: byEmail.name, email: byEmail.email, source: "database_contact" };

      // Match by full name
      const byName = contacts.find((c) => c.name.toLowerCase() === q);
      if (byName) return { name: byName.name, email: byName.email, source: "database_contact" };

      // Substring match in name or handle
      const bySub = contacts.find(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          q.includes(c.name.toLowerCase()) ||
          (c.paypalHandle && c.paypalHandle.toLowerCase().includes(q))
      );
      if (bySub) return { name: bySub.name, email: bySub.email, source: "database_contact" };
    } catch (err) {
      console.warn("[ContactResolver DB Warning]", err);
    }
  }

  // 3. Check recent live PayPal transactions
  try {
    const txs = await paypalClient.fetchRecentTransactions(168);
    for (const tx of txs) {
      const debtor = (tx.debtorName || "").toLowerCase();
      const email = (tx.recipientEmail || "").toLowerCase();

      if (debtor.includes(q) || q.includes(debtor) || (email && email.includes(q))) {
        if (tx.recipientEmail) {
          return {
            name: tx.debtorName || query,
            email: tx.recipientEmail,
            source: "transaction_history",
          };
        }
      }
    }
  } catch (err) {
    console.warn("[ContactResolver PayPal Warning]", err);
  }

  return null;
}
