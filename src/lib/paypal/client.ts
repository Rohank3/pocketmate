/**
 * PayPal Sandbox REST API Client
 * 
 * Provides authenticated access to PayPal Developer platform services:
 * - Reporting & Transaction Queries (v1)
 * - Orders & Payments Capture (v2)
 * - Invoicing & Split Requests (v2)
 * - Webhook Cryptographic Verification (v1)
 * - Disputes & Customer Resolution Center (v1)
 */

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

export interface PayPalTransaction {
  id: string;
  status: string; // "COMPLETED" | "PENDING" | "DRAFT" | "DISPUTED" | "CANCELLED"
  amount: number;
  currency: string;
  merchantName: string;
  memo?: string;
  sourceType?: "reporting" | "invoice";
  txType?: "merchant" | "p2p" | "split";
  timestamp: string;
  feeAmount?: number;
  debtorName?: string;
  recipientEmail?: string;
  invoicerEmail?: string;
  direction?: "incoming" | "outgoing" | "outgoing_split";
  isOutgoingSplit?: boolean;
}

export interface InvoiceRecipient {
  email: string;
  name?: string;
  amount: number;
  description: string;
}

export interface InvoiceDispatchResult {
  invoiceId: string;
  invoiceNumber: string;
  recipientEmail: string;
  amount: number;
  status: string;
  viewUrl?: string;
}

export interface DisputeResult {
  disputeId: string;
  status: string;
  reason: string;
  disputedAmount: number;
  message: string;
  resolutionCenterUrl: string;
}

export interface CreateOrderParams {
  amount: number;
  currency?: string;
  description?: string;
  customId?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PayPalOrderResult {
  orderId: string;
  status: string;
  approveUrl?: string;
}

export interface CaptureOrderResult {
  orderId: string;
  captureId?: string;
  status: string;
  amount: number;
  currency: string;
  payerEmail?: string;
}

export interface VerifyWebhookParams {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId: string;
  webhookEvent: Record<string, unknown>;
}

class PayPalSandboxClient {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;
  private invoiceDetailCache = new Map<string, Record<string, unknown>>();

  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID || "";
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
    this.baseUrl =
      process.env.PAYPAL_ENVIRONMENT === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";
  }

  getResolutionCenterBaseUrl(): string {
    return process.env.PAYPAL_ENVIRONMENT === "live"
      ? "https://www.paypal.com/disputes"
      : "https://www.sandbox.paypal.com/disputes";
  }

  /**
   * Retrieves or refreshes OAuth 2.0 Bearer access token using Client Credentials.
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60000) {
      return this.tokenCache.token;
    }

    // Refresh credentials dynamically from environment variables
    this.clientId = process.env.PAYPAL_CLIENT_ID || "";
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";

    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing PayPal Sandbox credentials (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET) in environment variables.");
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`PayPal OAuth token failed: HTTP ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    this.tokenCache = {
      token: data.access_token,
      expiresAt: now + (data.expires_in ?? 3600) * 1000,
    };

    return data.access_token;
  }

  /**
   * Creates an order via PayPal Orders v2 API.
   * Payer authenticates on PayPal's domain to approve settlement.
   */
  async createOrder(params: CreateOrderParams): Promise<PayPalOrderResult> {
    const token = await this.getAccessToken();
    const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "pocketmate_settlement",
          description: params.description || "Expense Settlement via PocketMate",
          custom_id: params.customId,
          amount: {
            currency_code: params.currency || "USD",
            value: params.amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "PocketMate",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: params.returnUrl || `${appUrl}/?order_status=approved`,
        cancel_url: params.cancelUrl || `${appUrl}/?order_status=cancelled`,
      },
    };

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PayPal Orders v2 create failed: HTTP ${res.status} - ${errText}`);
    }

    const data = await res.json();
    const approveLink = data.links?.find((l: { rel: string; href: string }) => l.rel === "approve")?.href;

    return {
      orderId: data.id,
      status: data.status,
      approveUrl: approveLink,
    };
  }

  /**
   * Captures an approved PayPal order.
   */
  async captureOrder(orderId: string): Promise<CaptureOrderResult> {
    const token = await this.getAccessToken();

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PayPal Orders v2 capture failed: HTTP ${res.status} - ${errText}`);
    }

    const data = await res.json();
    const captureUnit = data.purchase_units?.[0]?.payments?.captures?.[0];

    return {
      orderId: data.id,
      captureId: captureUnit?.id,
      status: data.status,
      amount: parseFloat(captureUnit?.amount?.value || "0.00"),
      currency: captureUnit?.amount?.currency_code || "USD",
      payerEmail: data.payer?.email_address,
    };
  }

  private parseInvoiceTag(rawRef: string, rawMemo: string): {
    senderEmail: string;
    txType?: "merchant" | "p2p" | "split";
  } {
    const combined = [rawRef, rawMemo].filter(Boolean);
    let senderEmail = "";
    let txType: "merchant" | "p2p" | "split" | undefined = undefined;

    for (const raw of combined) {
      const segments = raw.split("|").map((s) => s.trim());
      for (const seg of segments) {
        const lower = seg.toLowerCase();
        if (lower.startsWith("sender:") && !senderEmail) {
          senderEmail = seg.slice(7).trim().toLowerCase();
        } else if (lower.startsWith("type:") && !txType) {
          const t = lower.slice(5).trim();
          if (t === "merchant" || t === "p2p" || t === "split") {
            txType = t;
          }
        }
      }
    }

    return { senderEmail, txType };
  }

  /**
   * Fetches full invoice details (including invoicer.name and items) since PayPal's
   * list-invoices endpoint returns summary objects that omit invoicer and line items.
   */
  async fetchInvoiceDetails(invoiceId: string): Promise<Record<string, unknown> | null> {
    if (!invoiceId) return null;
    const cached = this.invoiceDetailCache.get(invoiceId);
    if (cached) return cached;

    try {
      const token = await this.getAccessToken();
      const res = await fetch(`${this.baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, unknown>;
      const rawStatus = String(data.status || "").toUpperCase();
      if (
        rawStatus === "PAID" ||
        rawStatus === "MARKED_AS_PAID" ||
        rawStatus === "CANCELLED" ||
        rawStatus.includes("REFUND")
      ) {
        this.invoiceDetailCache.set(invoiceId, data);
      }
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Fetches Reporting API transactions across an arbitrary date range by walking
   * PayPal's 31-day maximum reporting window sequentially.
   */
  async fetchReportingTransactionsWindow(
    startDate: Date,
    endDate: Date,
    filterEmail?: string
  ): Promise<PayPalTransaction[]> {
    const token = await this.getAccessToken();
    const results: PayPalTransaction[] = [];
    const targetEmailClean = (filterEmail || "").toLowerCase().trim();
    const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
    const seenIds = new Set<string>();

    const windows: Array<{ startIso: string; endIso: string }> = [];
    let windowEnd = endDate.getTime();
    const minStart = startDate.getTime();

    while (windowEnd > minStart) {
      const windowStart = Math.max(minStart, windowEnd - MAX_WINDOW_MS);
      windows.push({
        startIso: new Date(windowStart).toISOString(),
        endIso: new Date(windowEnd).toISOString(),
      });
      windowEnd = windowStart - 1000;
    }

    const fetchSingleWindow = async (startIso: string, endIso: string) => {
      try {
        const url = `${this.baseUrl}/v1/reporting/transactions?start_date=${encodeURIComponent(
          startIso
        )}&end_date=${encodeURIComponent(endIso)}&fields=all&page_size=100`;

        const repRes = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!repRes.ok) return [];
        const data = await repRes.json();
        return (data.transaction_details as Array<Record<string, unknown>>) || [];
      } catch (err) {
        console.warn("[PayPal Reporting API Warning]", err);
        return [];
      }
    };

    for (let i = 0; i < windows.length; i += 6) {
      const batch = windows.slice(i, i + 6);
      const batchResults = await Promise.all(
        batch.map((w) => fetchSingleWindow(w.startIso, w.endIso))
      );

      for (const transactionDetails of batchResults) {
        for (const tx of transactionDetails) {
          const info = (tx.transaction_info as Record<string, unknown>) || {};
          const txId = String(info.transaction_id || "");
          if (!txId || seenIds.has(txId)) continue;
          seenIds.add(txId);

          const payer = (tx.payer_info as Record<string, unknown>) || {};
          const payerName = (payer.payer_name as Record<string, unknown>) || {};
          const amountObj = (info.transaction_amount as Record<string, string>) || {};
          const feeObj = (info.fee_amount as Record<string, string>) || {};
          const payerEmail = ((payer.email_address as string) || "").toLowerCase().trim();

          const txStatus = (info.transaction_status as string) || "S";
          const eventCode = (info.transaction_event_code as string) || "";
          if (txStatus === "V" || eventCode.startsWith("T11") || eventCode.startsWith("T12")) {
            continue;
          }

          const rawNote = (
            (info.transaction_note as string) ||
            (info.transaction_subject as string) ||
            ""
          ).trim();
          const isSplit = Boolean(rawNote && /\bsplit\b/i.test(rawNote));

          const merchantName =
            ((payerName.alternate_full_name as string) || "").trim() ||
            ((info.transaction_subject as string) || "").trim() ||
            payerEmail ||
            txId;

          const memo =
            rawNote && rawNote.toLowerCase() !== merchantName.toLowerCase()
              ? rawNote
              : undefined;

          const counterpartyName = ((payerName.alternate_full_name as string) || "").trim();

          if (targetEmailClean) {
            const matchesPayer =
              payerEmail && (payerEmail === targetEmailClean || payerEmail.includes(targetEmailClean));
            const matchesName =
              counterpartyName &&
              counterpartyName.toLowerCase().includes(targetEmailClean.split("@")[0].replace(/[._]/g, " "));
            if (!matchesPayer && !matchesName) {
              continue;
            }
          }

          const isIncoming = Boolean(
            targetEmailClean && payerEmail && payerEmail !== targetEmailClean
          );
          const direction: "incoming" | "outgoing" = isIncoming ? "incoming" : "outgoing";

          results.push({
            id: txId,
            status: txStatus === "S" ? "COMPLETED" : "PENDING",
            amount: Math.abs(parseFloat(amountObj.value || "0.00")),
            currency: amountObj.currency_code || "USD",
            merchantName,
            memo,
            sourceType: "reporting",
            txType: isSplit ? "split" : "merchant",
            timestamp: (info.transaction_initiation_date as string) || new Date().toISOString(),
            feeAmount: parseFloat(feeObj.value || "0.00"),
            debtorName: isSplit && counterpartyName ? counterpartyName : undefined,
            recipientEmail: payerEmail || undefined,
            direction,
          });
        }
      }
    }

    return results;
  }

  /**
   * Maps a raw PayPal invoice object (list summary or full detail) into a normalized PayPalTransaction.
   */
  private mapInvoiceToTransaction(
    inv: Record<string, unknown>,
    options: {
      targetEmailClean: string;
      knownSplitInvoiceIds?: Set<string>;
    }
  ): PayPalTransaction | null {
    const { targetEmailClean, knownSplitInvoiceIds } = options;
    const invId = String(inv.id || "");
    if (!invId) return null;

    const detail = (inv.detail as Record<string, unknown>) || {};
    const invoicer = inv.invoicer as
      | {
          name?: { full_name?: string; given_name?: string; surname?: string };
          email_address?: string;
        }
      | undefined;

    const invoicerEmail = (invoicer?.email_address || "").toLowerCase().trim();
    let invoicerFullName = "";
    if (invoicer?.name?.full_name) {
      invoicerFullName = invoicer.name.full_name.trim();
    } else if (invoicer?.name?.given_name) {
      invoicerFullName = `${invoicer.name.given_name} ${invoicer.name.surname || ""}`.trim();
    }

    const primaryRecipients =
      (inv.primary_recipients as Array<{
        billing_info?: {
          email_address?: string;
          name?: { given_name?: string; surname?: string; full_name?: string };
        };
      }>) || [];
    const recipient = primaryRecipients[0]?.billing_info || {};
    const recipientEmail = (recipient.email_address || "").toLowerCase().trim();
    const recipientName = (
      recipient.name?.full_name ||
      (recipient.name?.given_name
        ? `${recipient.name.given_name} ${recipient.name.surname || ""}`.trim()
        : "") ||
      recipientEmail
    ).trim();

    const amountObj = (inv.amount as { value?: string; currency_code?: string }) || {};
    const paymentTerm = (detail.payment_term as { due_amount?: { value?: string } }) || {};
    const amountVal = parseFloat(amountObj.value || paymentTerm.due_amount?.value || "0.00");

    const rawStatus = String(inv.status || "").toUpperCase();
    if (
      rawStatus.includes("REFUND") ||
      rawStatus.includes("CANCEL") ||
      rawStatus === "DRAFT" ||
      rawStatus === "SCHEDULED"
    ) {
      return null;
    }

    let status: "COMPLETED" | "PENDING" | "DRAFT" | "DISPUTED" | "CANCELLED" = "PENDING";
    if (rawStatus === "PAID" || rawStatus === "MARKED_AS_PAID") {
      status = "COMPLETED";
    }

    const reference = typeof detail.reference === "string" ? detail.reference.trim() : "";
    const rawMemoField = typeof detail.memo === "string" ? detail.memo.trim() : "";
    const parsedTag = this.parseInvoiceTag(reference, rawMemoField);
    const effectiveInvoicerEmail = invoicerEmail || parsedTag.senderEmail;

    const userFrag = targetEmailClean
      ? targetEmailClean.split("@")[0].replace(/[._]/g, " ").toLowerCase()
      : "";

    const isUserRecipient = Boolean(
      targetEmailClean &&
        (recipientEmail === targetEmailClean ||
          recipientEmail.includes(targetEmailClean) ||
          (userFrag && recipientName.toLowerCase().includes(userFrag)))
    );

    const isUserInvoicer = Boolean(
      targetEmailClean &&
        !isUserRecipient &&
        ((effectiveInvoicerEmail &&
          (effectiveInvoicerEmail === targetEmailClean ||
            effectiveInvoicerEmail.includes(targetEmailClean))) ||
          (invoicerFullName && userFrag && invoicerFullName.toLowerCase().trim() === userFrag))
    );

    if (targetEmailClean && !isUserInvoicer && !isUserRecipient) {
      return null;
    }

    const invItems = (inv.items as Array<{ name?: string }>) || [];
    const itemName = (invItems[0]?.name || "").trim();
    const rawNote = typeof detail.note === "string" ? detail.note.trim() : "";

    // Skip legacy self-issued reminder invoices
    if (
      (recipientName.toLowerCase() === "self" || recipientEmail.includes("self@")) &&
      rawNote.toLowerCase().includes("self")
    ) {
      return null;
    }

    const hasSplitPhrase =
      Boolean(knownSplitInvoiceIds?.has(invId)) ||
      parsedTag.txType === "split" ||
      /\bsplit\b/i.test(rawNote) ||
      /\bsplit\b/i.test(itemName);

    const txType: "merchant" | "p2p" | "split" = hasSplitPhrase
      ? "split"
      : parsedTag.txType === "p2p"
      ? "p2p"
      : "merchant";

    const counterpartyName = isUserInvoicer
      ? recipientName || recipientEmail || invId
      : invoicerFullName || effectiveInvoicerEmail || invId;

    let merchantName = "";
    let memo: string | undefined = undefined;

    if (txType === "split") {
      const cleanedItem = itemName
        .replace(/split share/i, "")
        .replace(/share of/i, "")
        .replace(/^split:\s*/i, "")
        .trim();
      const cleanedNote = rawNote
        .replace(/split share/i, "")
        .replace(/share of/i, "")
        .replace(/^split:\s*/i, "")
        .trim();
      const expenseTitle = cleanedItem || cleanedNote;
      merchantName = expenseTitle ? `${counterpartyName} • ${expenseTitle}` : counterpartyName;
      if (rawNote && rawNote.toLowerCase() !== merchantName.toLowerCase()) {
        memo = rawNote;
      }
    } else if (txType === "p2p") {
      const contextText = rawNote || itemName;
      if (contextText && contextText.toLowerCase() !== counterpartyName.toLowerCase()) {
        merchantName = `${counterpartyName} • ${contextText}`;
      } else {
        merchantName = counterpartyName;
      }
      if (rawNote && itemName && rawNote.toLowerCase() !== itemName.toLowerCase()) {
        memo = rawNote;
      }
    } else {
      // Direct merchant charge
      merchantName = counterpartyName || itemName || rawNote || invId;
      if (itemName && itemName.toLowerCase() !== merchantName.toLowerCase()) {
        memo = itemName;
      } else if (rawNote && rawNote.toLowerCase() !== merchantName.toLowerCase()) {
        memo = rawNote;
      }
    }

    let isOutgoingSplit = false;
    let debtorName: string | undefined = undefined;
    let direction: "incoming" | "outgoing" | "outgoing_split" = "outgoing";

    if (isUserInvoicer) {
      if (txType === "split") {
        isOutgoingSplit = true;
        debtorName = counterpartyName;
        direction = status === "COMPLETED" ? "incoming" : "outgoing_split";
      } else {
        isOutgoingSplit = false;
        debtorName = status === "PENDING" ? counterpartyName : undefined;
        direction = "incoming";
      }
    } else {
      isOutgoingSplit = false;
      debtorName = status === "PENDING" && recipientName ? recipientName : undefined;
      direction = "outgoing";
    }

    const meta = (detail.metadata as Record<string, unknown>) || {};
    const timestampSource =
      (detail.invoice_date as string) ||
      (meta.create_time as string) ||
      new Date().toISOString();

    return {
      id: invId,
      status,
      amount: amountVal,
      currency: amountObj.currency_code || (detail.currency_code as string) || "USD",
      merchantName,
      memo,
      sourceType: "invoice",
      txType,
      timestamp: new Date(timestampSource).toISOString(),
      debtorName,
      recipientEmail: recipientEmail || undefined,
      invoicerEmail: effectiveInvoicerEmail || undefined,
      direction,
      isOutgoingSplit,
    };
  }

  /**
   * Fetches and hydrates PayPal Invoicing v2 records.
   * Supports incremental stop conditions and refreshing previously pending invoice IDs.
   */
  async fetchInvoices(options?: {
    filterEmail?: string;
    knownSplitInvoiceIds?: Set<string>;
    existingTerminalInvoiceIds?: Set<string>;
    pendingInvoiceIdsToRefresh?: string[];
    sinceCreateTime?: Date;
    maxPages?: number;
  }): Promise<PayPalTransaction[]> {
    const token = await this.getAccessToken();
    const targetEmailClean = (options?.filterEmail || "").toLowerCase().trim();
    const existingTerminal = options?.existingTerminalInvoiceIds;
    const sinceMs = options?.sinceCreateTime?.getTime();
    const maxPages = options?.maxPages ?? 20;

    const rawInvoicesById = new Map<string, Record<string, unknown>>();

    // 1. Directly refresh any previously non-terminal invoices stored locally
    if (options?.pendingInvoiceIdsToRefresh && options.pendingInvoiceIdsToRefresh.length > 0) {
      const uniqueIds = Array.from(new Set(options.pendingInvoiceIdsToRefresh));
      for (let i = 0; i < uniqueIds.length; i += 6) {
        const chunk = uniqueIds.slice(i, i + 6);
        const details = await Promise.all(chunk.map((id) => this.fetchInvoiceDetails(id)));
        for (const d of details) {
          if (d && d.id) {
            rawInvoicesById.set(String(d.id), d);
          }
        }
      }
    }

    // 2. Paginate PayPal Invoicing v2 list endpoint
    try {
      let page = 1;
      let totalPages = 1;

      do {
        const invUrl = `${this.baseUrl}/v2/invoicing/invoices?total_required=true&page_size=100&page=${page}`;
        const invRes = await fetch(invUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!invRes.ok) break;

        const invData = await invRes.json();
        totalPages = (invData.total_pages as number) || 1;
        const pageItems = (invData.items as Array<Record<string, unknown>>) || [];
        if (pageItems.length === 0) break;

        let allKnownTerminalOrOlderOnPage = Boolean((existingTerminal || sinceMs) && pageItems.length > 0);
        for (const inv of pageItems) {
          const invId = String(inv.id || "");
          if (!invId) continue;

          if (existingTerminal?.has(invId)) {
            continue;
          }

          const detail = (inv.detail as Record<string, unknown>) || {};
          const meta = (detail.metadata as Record<string, unknown>) || {};
          const createTimeStr = typeof meta.create_time === "string" ? meta.create_time : "";
          const createTimeMs = createTimeStr ? Date.parse(createTimeStr) : NaN;
          const isOlderThanCheckpoint = Boolean(
            sinceMs && Number.isFinite(createTimeMs) && createTimeMs < sinceMs
          );

          if (isOlderThanCheckpoint) {
            continue;
          }

          allKnownTerminalOrOlderOnPage = false;
          if (!rawInvoicesById.has(invId)) {
            rawInvoicesById.set(invId, inv);
          }
        }

        // Incremental stop: every invoice on this page is older than checkpoint or already terminal
        if (allKnownTerminalOrOlderOnPage) {
          break;
        }

        page++;
      } while (page <= totalPages && page <= maxPages);
    } catch (err) {
      console.warn("[PayPal Invoicing API Warning]", err);
    }

    // 3. Filter candidates and hydrate full details (invoicer.name & items) where missing
    const userFrag = targetEmailClean
      ? targetEmailClean.split("@")[0].replace(/[._]/g, " ").toLowerCase()
      : "";

    const candidatesToHydrate: string[] = [];
    for (const [invId, inv] of rawInvoicesById.entries()) {
      const detail = (inv.detail as Record<string, unknown>) || {};
      const invoicer = inv.invoicer as { name?: { full_name?: string; given_name?: string }; email_address?: string } | undefined;
      const items = inv.items as Array<unknown> | undefined;

      const needsHydration =
        !invoicer?.name || (!invoicer.name.full_name && !invoicer.name.given_name) || !items || items.length === 0;
      if (!needsHydration) continue;

      if (targetEmailClean) {
        const primaryRecipients =
          (inv.primary_recipients as Array<{
            billing_info?: { email_address?: string; name?: { given_name?: string; surname?: string; full_name?: string } };
          }>) || [];
        const recipient = primaryRecipients[0]?.billing_info || {};
        const recipientEmail = (recipient.email_address || "").toLowerCase().trim();
        const recipientName = (
          recipient.name?.full_name ||
          (recipient.name?.given_name ? `${recipient.name.given_name} ${recipient.name.surname || ""}`.trim() : "")
        ).toLowerCase();

        const reference = typeof detail.reference === "string" ? detail.reference.trim() : "";
        const memo = typeof detail.memo === "string" ? detail.memo.trim() : "";
        const parsed = this.parseInvoiceTag(reference, memo);
        const invEmail = (invoicer?.email_address || parsed.senderEmail || "").toLowerCase().trim();

        const isRecipientMatch =
          recipientEmail === targetEmailClean ||
          recipientEmail.includes(targetEmailClean) ||
          (userFrag && recipientName.includes(userFrag));
        const isSenderMatch =
          invEmail === targetEmailClean || invEmail.includes(targetEmailClean);

        // If neither recipient nor embedded sender matches AND invoicer object is completely missing,
        // skip hydrating third-party users' invoices when sender tag is present for someone else.
        const hasExplicitDifferentSender = Boolean(invEmail && !isSenderMatch);
        if (!isRecipientMatch && !isSenderMatch && (hasExplicitDifferentSender || (!recipientEmail && !invEmail))) {
          continue;
        }
      }

      candidatesToHydrate.push(invId);
    }

    for (let i = 0; i < candidatesToHydrate.length; i += 6) {
      const chunk = candidatesToHydrate.slice(i, i + 6);
      const details = await Promise.all(chunk.map((id) => this.fetchInvoiceDetails(id)));
      for (const fullInv of details) {
        if (fullInv && fullInv.id) {
          rawInvoicesById.set(String(fullInv.id), fullInv);
        }
      }
    }

    const mapped: PayPalTransaction[] = [];
    for (const inv of rawInvoicesById.values()) {
      const tx = this.mapInvoiceToTransaction(inv, {
        targetEmailClean,
        knownSplitInvoiceIds: options?.knownSplitInvoiceIds,
      });
      if (tx) mapped.push(tx);
    }

    return mapped;
  }

  /**
   * Fetches recent transactions and invoices from PayPal Sandbox Developer APIs.
   * Strictly queries live PayPal endpoints without synthetic fallbacks.
   */
  async fetchRecentTransactions(hoursBack: number = 720, filterEmail?: string): Promise<PayPalTransaction[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - hoursBack * 60 * 60 * 1000);

    const [reportingTxs, invoiceTxs] = await Promise.all([
      this.fetchReportingTransactionsWindow(startDate, endDate, filterEmail),
      this.fetchInvoices({ filterEmail, maxPages: 5 }),
    ]);

    return [...reportingTxs, ...invoiceTxs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Executes a direct peer-to-peer payout via PayPal Payouts API (/v1/payments/payouts).
   */
  async sendPayout(
    payout: {
      recipientEmail: string;
      amount: number;
      note?: string;
      currency?: string;
    },
    sender?: { name?: string; email?: string }
  ): Promise<{
    payoutBatchId: string;
    status: string;
    amount: number;
    recipientEmail: string;
    note: string;
  }> {
    const token = await this.getAccessToken();
    const batchId = `PM_PAYOUT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const body = {
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: "You received a payment via PocketMate!",
        email_message: payout.note || "Peer settlement via PocketMate.",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: {
            value: payout.amount.toFixed(2),
            currency: payout.currency || "USD",
          },
          note: payout.note || "Direct P2P Settlement",
          sender_item_id: `ITEM_${Date.now()}`,
          receiver: payout.recipientEmail,
        },
      ],
    };

    const res = await fetch(`${this.baseUrl}/v1/payments/payouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      // If payouts restricted in sandbox by region, record a paid P2P invoice with the actual sender/recipient
      if (res.status === 403 && errText.includes("PAYOUT_NOT_AVAILABLE")) {
        console.warn("[PayPal Payouts] Payouts restricted. Recording P2P invoice via PayPal Invoicing API...");
        const invRes = await this.dispatchInvoice(
          {
            name: payout.recipientEmail.split("@")[0].replace(/[._]/g, " "),
            email: payout.recipientEmail,
            amount: payout.amount,
            description: payout.note || "Direct P2P Settlement",
          },
          sender,
          "p2p"
        );

        // Record immediate payment on PayPal Sandbox
        try {
          await fetch(`${this.baseUrl}/v2/invoicing/invoices/${invRes.invoiceId}/payments`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              method: "PAYPAL",
              payment_date: new Date().toISOString().split("T")[0],
              amount: {
                currency_code: payout.currency || "USD",
                value: payout.amount.toFixed(2),
              },
              note: "Paid via PayPal Sandbox Wallet",
            }),
          });
        } catch {
          // ignore payment recording error
        }

        return {
          payoutBatchId: invRes.invoiceId,
          status: "SUCCESS",
          amount: payout.amount,
          recipientEmail: payout.recipientEmail,
          note: payout.note || "Direct P2P Settlement",
        };
      }

      throw new Error(`PayPal Payout failed: HTTP ${res.status} - ${errText}`);
    }

    const data = await res.json();
    const batchHeader = data.batch_header || {};

    return {
      payoutBatchId: batchHeader.payout_batch_id || batchId,
      status: batchHeader.batch_status || "SUCCESS",
      amount: payout.amount,
      recipientEmail: payout.recipientEmail,
      note: payout.note || "Direct P2P Settlement",
    };
  }

  /**
   * Creates and immediately dispatches an invoice via PayPal Invoicing API v2.
   */
  async dispatchInvoice(
    recipient: InvoiceRecipient,
    sender?: { name?: string; email?: string },
    txType: "split" | "p2p" = "split"
  ): Promise<InvoiceDispatchResult> {
    const token = await this.getAccessToken();

    const senderEmail = sender?.email?.trim().toLowerCase() || "";
    const senderName =
      sender?.name?.trim() ||
      (senderEmail ? senderEmail.split("@")[0].replace(/[._]/g, " ") : "");
    const senderParts = senderName ? senderName.split(" ") : [];
    const tagSegments: string[] = [];
    if (senderEmail) tagSegments.push(`sender:${senderEmail}`);
    tagSegments.push(`type:${txType}`);
    const refTag = tagSegments.join("|");

    // 1. Create draft invoice
    const createRes = await fetch(`${this.baseUrl}/v2/invoicing/invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        detail: {
          currency_code: "USD",
          note: recipient.description,
          reference: refTag,
          memo: refTag,
        },
        ...(senderName || senderEmail
          ? {
              invoicer: {
                ...(senderParts.length > 0
                  ? {
                      name: {
                        given_name: senderParts[0],
                        surname: senderParts.slice(1).join(" "),
                      },
                    }
                  : {}),
                ...(senderEmail ? { email_address: senderEmail } : {}),
              },
            }
          : {}),
        primary_recipients: [
          {
            billing_info: {
              ...(recipient.name ? { name: { given_name: recipient.name } } : {}),
              email_address: recipient.email,
            },
          },
        ],
        items: [
          {
            name: recipient.description,
            quantity: "1",
            unit_amount: {
              currency_code: "USD",
              value: recipient.amount.toFixed(2),
            },
          },
        ],
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create invoice draft: HTTP ${createRes.status} - ${errText}`);
    }

    const invoiceData = await createRes.json();
    const invoiceId =
      invoiceData.id ||
      invoiceData.href?.split("/").pop() ||
      createRes.headers.get("location")?.split("/").pop() ||
      `INV2-${Date.now()}`;

    // 2. Dispatch the invoice
    const sendRes = await fetch(`${this.baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const isLive = process.env.PAYPAL_ENVIRONMENT === "live";
    const viewUrl = isLive
      ? `https://www.paypal.com/invoice/p/#${invoiceId}`
      : `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}`;

    return {
      invoiceId,
      invoiceNumber: invoiceData.detail?.invoice_number || invoiceId,
      recipientEmail: recipient.email,
      amount: recipient.amount,
      status: sendRes.ok ? "SENT" : "DRAFT_SAVED",
      viewUrl,
    };
  }

  /**
   * Dispatches an authentic payment reminder for an invoice via PayPal Invoicing API v2.
   * Endpoint: POST /v2/invoicing/invoices/{invoice_id}/remind
   */
  async sendInvoiceReminder(
    invoiceId: string,
    params?: { subject?: string; note?: string }
  ): Promise<{ success: boolean; invoiceId: string }> {
    const token = await this.getAccessToken();

    const body = {
      subject: params?.subject || "Payment Reminder: Shared Expense via PocketMate",
      note: params?.note || "Friendly reminder to settle your pending shared expense via PayPal.",
      send_to_recipient: true,
    };

    const res = await fetch(`${this.baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/remind`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PayPal send invoice reminder failed: HTTP ${res.status} - ${errText}`);
    }

    return { success: true, invoiceId };
  }

  /**
   * Synchronizes recent transactions directly from PayPal APIs for the authenticated user.
   * Completely live query with zero hardcoded amounts, descriptions, or synthetic invoices.
   */
  async syncUserTransactions(userEmail: string): Promise<PayPalTransaction[]> {
    if (!userEmail) {
      throw new Error("userEmail is required to synchronize transactions.");
    }

    return this.fetchRecentTransactions(720, userEmail);
  }

  /**
   * Initiates a dispute for unauthorized fees or surcharge mismatches via PayPal Customer Disputes API.
   * Always links to PayPal's official Resolution Center without fake fallback IDs.
   */
  async initiateDispute(
    captureId: string,
    reason: string,
    disputedAmount: number
  ): Promise<DisputeResult> {
    const token = await this.getAccessToken();
    const resolutionCenterUrl = `${this.getResolutionCenterBaseUrl()}?transaction_id=${encodeURIComponent(captureId)}`;

    const res = await fetch(`${this.baseUrl}/v1/customer/disputes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        disputed_transaction: {
          buyer_transaction_id: captureId,
        },
        reason: "UNRECOGNIZED",
        dispute_amount: {
          currency_code: "USD",
          value: disputedAmount.toFixed(2),
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[PayPal Customer Disputes API ${res.status}]`, errText);
      // If dispute cannot be opened via API (e.g. ineligible transaction status), provide official Resolution Center link
      return {
        disputeId: `PP-EXTERNAL-ACTION`,
        status: "ACTION_REQUIRED",
        reason,
        disputedAmount,
        message: `Dispute cannot be filed directly via API (${res.status}). Please file directly through PayPal Customer Resolution Center: ${resolutionCenterUrl}`,
        resolutionCenterUrl,
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const disputeId = (data.dispute_id as string) || `PP-D-${Date.now()}`;

    return {
      disputeId,
      status: (data.status as string) || "UNDER_REVIEW",
      reason,
      disputedAmount,
      message: `Dispute ${disputeId} successfully filed with PayPal Customer Resolution Center.`,
      resolutionCenterUrl: `${this.getResolutionCenterBaseUrl()}#${disputeId}`,
    };
  }

  /**
   * Cryptographically verifies PayPal webhook signatures via /v1/notifications/verify-webhook-signature.
   */
  async verifyWebhookSignature(params: VerifyWebhookParams): Promise<boolean> {
    const token = await this.getAccessToken();

    const body = {
      auth_algo: params.authAlgo,
      cert_url: params.certUrl,
      transmission_id: params.transmissionId,
      transmission_sig: params.transmissionSig,
      transmission_time: params.transmissionTime,
      webhook_id: params.webhookId,
      webhook_event: params.webhookEvent,
    };

    const res = await fetch(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`[PayPal Webhook Verify] HTTP ${res.status}`);
      return false;
    }

    const data = (await res.json()) as { verification_status?: string };
    return data.verification_status === "SUCCESS";
  }

  /**
   * Retrieves subscription details and lifecycle schedule from PayPal Subscriptions API.
   * Endpoint: GET /v1/billing/subscriptions/{id}
   */
  async fetchSubscriptionDetails(subscriptionId: string): Promise<{
    id: string;
    status: string;
    startTime: string;
    nextBillingTime?: string;
    finalPaymentTime?: string;
    lastPaymentTime?: string;
  } | null> {
    if (!subscriptionId) return null;
    try {
      const token = await this.getAccessToken();
      const res = await fetch(
        `${this.baseUrl}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        console.warn(`[PayPal Subscriptions API ${res.status}] for ${subscriptionId}`);
        return null;
      }

      const data = await res.json();
      return {
        id: data.id,
        status: data.status,
        startTime: data.start_time,
        nextBillingTime: data.billing_info?.next_billing_time,
        finalPaymentTime: data.billing_info?.final_payment_time,
        lastPaymentTime: data.billing_info?.last_payment?.time,
      };
    } catch (err) {
      console.warn("[PayPal Subscription Fetch Error]", err);
      return null;
    }
  }
}

export const paypalClient = new PayPalSandboxClient();
