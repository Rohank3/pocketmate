export interface UserAccount {
  id: string;
  name: string;
  email: string;
  avatar: string;
  persona: "GENERAL" | "FREELANCER" | "BUSINESS";
}

export interface ContactRecord {
  id: string;
  name: string;
  email: string;
  category: "Dining" | "Work" | "General" | "Shopping" | "Entertainment";
  lastSplitAt: string;
  splitCount: number;
}

export interface InvoiceRecord {
  id: string;
  paypalInvoiceId: string;
  paypalInvoiceUrl: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  amount: number;
  currency: string;
  description: string;
  status: "UNPAID" | "PAID" | "DECLINED" | "ADJUSTMENT_REQUESTED";
  declineReason?: string;
  proposedAdjustmentAmount?: number;
  createdAt: string;
  paidAt?: string;
}
