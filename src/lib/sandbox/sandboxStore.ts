"use client";

import { UserAccount, ContactRecord, InvoiceRecord } from "@/types/sandboxUser";

const STORAGE_KEYS = {
  CURRENT_USER: "pocketmate_current_user_v2",
  USERS: "pocketmate_users_v2",
  CONTACTS: "pocketmate_contacts_v2",
  INVOICES: "pocketmate_invoices_v2",
};

export class SandboxStore {
  private static isBrowser(): boolean {
    return typeof window !== "undefined";
  }

  static getUsers(): UserAccount[] {
    if (!this.isBrowser()) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  static getCurrentUser(): UserAccount | null {
    if (!this.isBrowser()) return null;
    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  static setCurrentUser(user: UserAccount | null): void {
    if (!this.isBrowser()) return;
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } else {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    }
  }

  static loginWithEmail(email: string, name?: string): UserAccount {
    const users = this.getUsers();
    const cleanEmail = email.trim().toLowerCase();
    const existing = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (existing) {
      this.setCurrentUser(existing);
      return existing;
    }

    const initials = name
      ? name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : cleanEmail.slice(0, 2).toUpperCase();

    const newUser: UserAccount = {
      id: `usr_${Date.now()}`,
      name: name?.trim() || cleanEmail.split("@")[0].replace(/[._]/g, " "),
      email: cleanEmail,
      avatar: initials,
      persona: "GENERAL",
    };

    const updated = [...users, newUser];
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updated));
    }
    this.setCurrentUser(newUser);
    return newUser;
  }

  static getContactsForUser(userId: string): ContactRecord[] {
    if (!this.isBrowser()) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.CONTACTS);
    if (!stored) return [];
    try {
      const all = JSON.parse(stored);
      return all[userId] || [];
    } catch {
      return [];
    }
  }

  static addContactForUser(userId: string, contact: Omit<ContactRecord, "id">): ContactRecord {
    const contactsMap = this.getAllContactsMap();
    const userContacts = contactsMap[userId] || [];
    const newContact: ContactRecord = {
      ...contact,
      id: `cnt_${Date.now()}`,
    };
    contactsMap[userId] = [...userContacts, newContact];
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contactsMap));
    }
    return newContact;
  }

  private static getAllContactsMap(): Record<string, ContactRecord[]> {
    if (!this.isBrowser()) return {};
    const stored = localStorage.getItem(STORAGE_KEYS.CONTACTS);
    if (!stored) return {};
    try {
      return JSON.parse(stored);
    } catch {
      return {};
    }
  }

  /**
   * Realistic PayPal Contact Resolution Engine:
   * Looks up against user's past transaction/contact history.
   */
  static resolveContactByName(
    userId: string,
    query: string
  ): {
    match: ContactRecord | null;
    status: "EXACT" | "RECENCY_MATCH" | "UNKNOWN";
    candidates: ContactRecord[];
    reason?: string;
  } {
    const contacts = this.getContactsForUser(userId);
    const q = query.trim().toLowerCase();

    // Check for exact full name match first
    const exactFull = contacts.find((c) => c.name.toLowerCase() === q);
    if (exactFull) {
      return {
        match: exactFull,
        status: "EXACT",
        candidates: [exactFull],
      };
    }

    const candidates = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        q.includes(c.name.toLowerCase().split(" ")[0]) ||
        c.email.toLowerCase().includes(q)
    );

    if (candidates.length === 0) {
      return {
        match: null,
        status: "UNKNOWN",
        candidates: [],
        reason: `No saved PayPal contact or past transaction with "${query}".`,
      };
    }

    if (candidates.length === 1) {
      return {
        match: candidates[0],
        status: "EXACT",
        candidates,
      };
    }

    // Sort by recency of interaction
    const sorted = [...candidates].sort((a, b) => b.lastSplitAt.localeCompare(a.lastSplitAt));
    const mostRecent = sorted[0];
    const otherCandidate = sorted[1];

    return {
      match: mostRecent,
      status: "RECENCY_MATCH",
      candidates: sorted,
      reason: `Selected ${mostRecent.name} (${mostRecent.email}) based on your most recent transaction. To invoice ${otherCandidate.name} instead, specify "${otherCandidate.name}".`,
    };
  }

  static getInvoices(): InvoiceRecord[] {
    if (!this.isBrowser()) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.INVOICES);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  static getUserInvoices(userEmail: string): {
    incoming: InvoiceRecord[];
    outgoing: InvoiceRecord[];
  } {
    const all = this.getInvoices();
    const cleanEmail = userEmail.toLowerCase();
    return {
      incoming: all.filter((i) => i.recipientEmail.toLowerCase() === cleanEmail),
      outgoing: all.filter((i) => i.senderEmail.toLowerCase() === cleanEmail),
    };
  }

  static settleInvoice(invoiceId: string): InvoiceRecord | null {
    const all = this.getInvoices();
    let updatedRecord: InvoiceRecord | null = null;

    const updated = all.map((inv) => {
      if (inv.id === invoiceId) {
        updatedRecord = {
          ...inv,
          status: "PAID",
          paidAt: new Date().toISOString(),
        };
        return updatedRecord;
      }
      return inv;
    });

    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(updated));
    }
    return updatedRecord;
  }

  static declineInvoice(invoiceId: string, reason: string): InvoiceRecord | null {
    const all = this.getInvoices();
    let updatedRecord: InvoiceRecord | null = null;

    const updated = all.map((inv) => {
      if (inv.id === invoiceId) {
        updatedRecord = {
          ...inv,
          status: "DECLINED",
          declineReason: reason,
        };
        return updatedRecord;
      }
      return inv;
    });

    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(updated));
    }
    return updatedRecord;
  }

  static requestAdjustment(
    invoiceId: string,
    proposedAmount: number,
    reason: string
  ): InvoiceRecord | null {
    const all = this.getInvoices();
    let updatedRecord: InvoiceRecord | null = null;

    const updated = all.map((inv) => {
      if (inv.id === invoiceId) {
        updatedRecord = {
          ...inv,
          status: "ADJUSTMENT_REQUESTED",
          proposedAdjustmentAmount: proposedAmount,
          declineReason: reason,
        };
        return updatedRecord;
      }
      return inv;
    });

    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(updated));
    }
    return updatedRecord;
  }

  static createInvoice(
    invoice: Omit<
      InvoiceRecord,
      "id" | "createdAt" | "status" | "paypalInvoiceId" | "paypalInvoiceUrl"
    >
  ): InvoiceRecord {
    const all = this.getInvoices();
    const idNum = Math.floor(1000 + Math.random() * 9000);
    const invoiceId = `inv_${Date.now()}`;
    const paypalNum = `INV2-SB-${idNum}`;

    const newInvoice: InvoiceRecord = {
      ...invoice,
      id: invoiceId,
      paypalInvoiceId: paypalNum,
      paypalInvoiceUrl: `https://www.sandbox.paypal.com/invoice/p/#${paypalNum}`,
      status: "UNPAID",
      createdAt: new Date().toISOString(),
    };

    const updated = [newInvoice, ...all];
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(updated));
    }
    return newInvoice;
  }
}
