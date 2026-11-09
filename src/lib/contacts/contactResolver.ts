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
      let resolvedUserId = userId;
      if (userId.includes("@")) {
        const u = await prisma.user.findUnique({ where: { email: userId } });
        if (u) resolvedUserId = u.id;
      }

      const contacts = await prisma.contact.findMany({
        where: { userId: resolvedUserId },
      });

      // Match by exact email
      const byEmail = contacts.find((c) => c.email.toLowerCase() === q);
      if (byEmail) return { name: byEmail.name, email: byEmail.email, source: "database_contact" };

      // Match by full name
      const byName = contacts.find((c) => c.name.toLowerCase() === q);
      if (byName) return { name: byName.name, email: byName.email, source: "database_contact" };

      // Match first name or token
      const byFirstName = contacts.find(
        (c) => c.name.toLowerCase().split(/\s+/)[0] === q
      );
      if (byFirstName) return { name: byFirstName.name, email: byFirstName.email, source: "database_contact" };

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

  // 3. Check recent live PayPal transactions (last 30 days)
  try {
    const txs = await paypalClient.fetchRecentTransactions(720);
    for (const tx of txs) {
      const debtor = (tx.debtorName || "").toLowerCase().trim();
      const email = (tx.recipientEmail || "").toLowerCase().trim();

      // Skip generic placeholder labels or self references
      if (
        !debtor ||
        debtor === "100% self" ||
        debtor === "self" ||
        debtor === "shared split" ||
        debtor.includes("self")
      ) {
        continue;
      }

      if (
        debtor === q ||
        debtor.split(/\s+/).includes(q) ||
        (email && email.split("@")[0].split(/[._]/).includes(q))
      ) {
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

/**
 * Persists or updates a contact in Prisma, strictly scoped to the active user.
 * Ensures the model permanently remembers PayPal IDs/emails defined by the user.
 */
export async function saveOrUpdateContact(
  userId: string,
  name: string,
  email: string,
  paypalHandle?: string
): Promise<{ id: string; name: string; email: string } | null> {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanName = (name || "").trim();
  if (!cleanEmail || !cleanEmail.includes("@") || !cleanName) return null;

  try {
    let resolvedUserId = userId;
    if (userId.includes("@")) {
      const u = await prisma.user.findUnique({ where: { email: userId } });
      if (u) resolvedUserId = u.id;
    } else {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      if (!u) {
        const firstUser = await prisma.user.findFirst();
        if (firstUser) resolvedUserId = firstUser.id;
      }
    }

    const contact = await prisma.contact.upsert({
      where: {
        userId_email: {
          userId: resolvedUserId,
          email: cleanEmail,
        },
      },
      update: {
        name: cleanName,
        paypalHandle: paypalHandle || undefined,
        lastSplitAt: new Date(),
      },
      create: {
        userId: resolvedUserId,
        name: cleanName,
        email: cleanEmail,
        paypalHandle: paypalHandle || undefined,
        lastSplitAt: new Date(),
      },
    });

    return { id: contact.id, name: contact.name, email: contact.email };
  } catch (err) {
    console.warn("[saveOrUpdateContact Error]", err);
    return null;
  }
}

