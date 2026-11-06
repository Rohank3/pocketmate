"use client";

import { UserAccount, ContactRecord, InvoiceRecord } from "@/types/sandboxUser";

export const PRESET_USERS: UserAccount[] = [
  {
    id: "usr_alex",
    name: "Alex Rivera",
    email: "alex@pocketmate.sandbox",
    avatar: "AR",
    persona: "GENERAL",
  },
  {
    id: "usr_dave_chen",
    name: "Dave Chen",
    email: "dave.chen@personal.example.com",
    avatar: "DC",
    persona: "GENERAL",
  },
  {
    id: "usr_dave_miller",
    name: "Dave Miller",
    email: "dave.miller@acmecorp.com",
    avatar: "DM",
    persona: "BUSINESS",
  },
  {
    id: "usr_sarah",
    name: "Sarah Jenkins",
    email: "sarah.jenkins@example.com",
    avatar: "SJ",
    persona: "GENERAL",
  },
  {
    id: "usr_mark",
    name: "Mark Miller",
    email: "mark.miller@example.com",
    avatar: "MM",
    persona: "GENERAL",
  },
];

const PRESET_CONTACTS: Record<string, ContactRecord[]> = {
  usr_alex: [
    {
      id: "cnt_dave_chen",
      name: "Dave Chen",
      email: "dave.chen@personal.example.com",
      category: "Dining",
      lastSplitAt: "2026-11-06",
      splitCount: 4,
    },
    {
      id: "cnt_dave_miller",
      name: "Dave Miller",
      email: "dave.miller@acmecorp.com",
      category: "Work",
      lastSplitAt: "2026-10-15",
      splitCount: 2,
    },
    {
      id: "cnt_sarah",
      name: "Sarah Jenkins",
      email: "sarah.jenkins@example.com",
      category: "Shopping",
      lastSplitAt: "2026-11-06",
      splitCount: 3,
    },
    {
      id: "cnt_mark",
      name: "Mark Miller",
      email: "mark.miller@example.com",
      category: "Dining",
      lastSplitAt: "2026-11-05",
      splitCount: 1,
    },
  ],
  usr_dave_chen: [
    {
      id: "cnt_alex",
      name: "Alex Rivera",
      email: "alex@pocketmate.sandbox",
      category: "Dining",
      lastSplitAt: "2026-11-06",
      splitCount: 4,
    },
  ],
};

const INITIAL_INVOICES: InvoiceRecord[] = [
  {
    id: "inv_bar_01",
    paypalInvoiceId: "INV2-BAR-65",
    paypalInvoiceUrl: "https://www.sandbox.paypal.com/invoice/p/#INV2-BAR-65",
    senderId: "usr_alex",
    senderName: "Alex Rivera",
    senderEmail: "alex@pocketmate.sandbox",
    recipientId: "usr_dave_chen",
    recipientName: "Dave Chen",
    recipientEmail: "dave.chen@personal.example.com",
    amount: 65.0,
    currency: "USD",
    description: "Downtown Craft Bar & Grill Split",
    status: "UNPAID",
    createdAt: "2026-11-06T23:30:00Z",
  },
  {
    id: "inv_zara_02",
    paypalInvoiceId: "INV2-ZARA-79",
    paypalInvoiceUrl: "https://www.sandbox.paypal.com/invoice/p/#INV2-ZARA-79",
    senderId: "usr_alex",
    senderName: "Alex Rivera",
    senderEmail: "alex@pocketmate.sandbox",
    recipientId: "usr_sarah",
    recipientName: "Sarah Jenkins",
    recipientEmail: "sarah.jenkins@example.com",
    amount: 79.0,
    currency: "USD",
    description: "Zara Mall Galleria ($65) & Starbucks Coffee ($14)",
    status: "UNPAID",
    createdAt: "2026-11-06T16:30:00Z",
  },
];

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
    if (!this.isBrowser()) return PRESET_USERS;
    const stored = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(PRESET_USERS));
      return PRESET_USERS;
    }
    try {
      return JSON.parse(stored);
    } catch {
      return PRESET_USERS;
    }
  }

  static getCurrentUser(): UserAccount {
    if (!this.isBrowser()) return PRESET_USERS[0];
    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (!stored) {
      const defaultUser = PRESET_USERS[0];
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(defaultUser));
      return defaultUser;
    }
    try {
      return JSON.parse(stored);
    } catch {
      return PRESET_USERS[0];
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
    if (!this.isBrowser()) return PRESET_CONTACTS[userId] || [];
    const stored = localStorage.getItem(STORAGE_KEYS.CONTACTS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(PRESET_CONTACTS));
      return PRESET_CONTACTS[userId] || [];
    }
    try {
      const all = JSON.parse(stored);
      return all[userId] || PRESET_CONTACTS[userId] || [];
    } catch {
      return PRESET_CONTACTS[userId] || [];
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
    if (!this.isBrowser()) return PRESET_CONTACTS;
    const stored = localStorage.getItem(STORAGE_KEYS.CONTACTS);
    if (!stored) return PRESET_CONTACTS;
    try {
      return JSON.parse(stored);
    } catch {
      return PRESET_CONTACTS;
    }
  }

  /**
   * Realistic PayPal Contact Disambiguation Engine:
   * Looks up ONLY against user's past transaction/contact history.
   * If multiple contacts match (e.g. 2 Daves), checks category history
   * to recommend without hallucination, while providing alternatives.
   */
  static resolveContactByName(
    userId: string,
    query: string,
    categoryHint?: string
  ): {
    match: ContactRecord | null;
    status: "EXACT" | "CATEGORY_MATCH" | "AMBIGUOUS" | "UNKNOWN";
    candidates: ContactRecord[];
    reason?: string;
  } {
    const contacts = this.getContactsForUser(userId);
    const q = query.trim().toLowerCase();

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

    // Multiple candidates sharing first name (e.g. Dave Chen vs Dave Miller)
    if (categoryHint) {
      const catMatch = candidates.find(
        (c) => c.category.toLowerCase() === categoryHint.toLowerCase()
      );
      if (catMatch) {
        return {
          match: catMatch,
          status: "CATEGORY_MATCH",
          candidates,
          reason: `Recommended based on your past ${categoryHint} splits with ${catMatch.name}.`,
        };
      }
    }

    // Sort by recency if no category hint matches
    const sorted = [...candidates].sort((a, b) => b.lastSplitAt.localeCompare(a.lastSplitAt));
    return {
      match: sorted[0],
      status: "AMBIGUOUS",
      candidates: sorted,
      reason: `Matched ${sorted[0].name} based on most recent split on ${sorted[0].lastSplitAt}.`,
    };
  }

  static getInvoices(): InvoiceRecord[] {
    if (!this.isBrowser()) return INITIAL_INVOICES;
    const stored = localStorage.getItem(STORAGE_KEYS.INVOICES);
    if (!stored) {
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(INITIAL_INVOICES));
      return INITIAL_INVOICES;
    }
    try {
      return JSON.parse(stored);
    } catch {
      return INITIAL_INVOICES;
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
