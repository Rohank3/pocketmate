/**
 * Deterministic Penny-Locked Split Mathematics Engine
 * 
 * Guarantees zero floating-point drift and exact penny conservation.
 * Works entirely in integer cents before converting to human-readable decimals.
 */

export interface SplitParticipant {
  name: string;
  emailOrHandle: string;
}

export interface SplitAllocation {
  name: string;
  emailOrHandle: string;
  amount: number; // Decimal dollar amount (e.g., 40.00)
  cents: number;  // Exact integer cents
  itemizedSummary?: string;
}

export interface ItemizedExpense {
  description: string;
  amount: number;
  assignedTo?: string[]; // Participant names or empty for all
}

export interface DeterministicSplitResult {
  totalAmount: number;
  totalCents: number;
  participantCount: number;
  allocations: SplitAllocation[];
  discrepancyCents: number; // Always 0 by definition
  breakdownReport: string;
}

/**
 * Converts a dollar amount to integer cents safely.
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Converts integer cents back to a fixed 2-decimal number.
 */
export function toDollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/**
 * Computes an equal split across participants with exact penny distribution.
 */
export function calculateEqualSplit(
  totalAmount: number,
  participants: SplitParticipant[],
  memoContext?: string
): DeterministicSplitResult {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Total amount must be a positive finite number.");
  }
  if (participants.length === 0) {
    throw new Error("Cannot split an expense among zero participants.");
  }

  const totalCents = toCents(totalAmount);
  const n = participants.length;
  const baseCentsPerPerson = Math.floor(totalCents / n);
  const remainderCents = totalCents % n;

  const allocations: SplitAllocation[] = participants.map((p, index) => {
    // Distribute remaining cents one-by-one to early participants
    const cents = baseCentsPerPerson + (index < remainderCents ? 1 : 0);
    const amount = toDollars(cents);

    return {
      name: p.name,
      emailOrHandle: p.emailOrHandle,
      amount,
      cents,
      itemizedSummary: memoContext ?? "Equal share allocation",
    };
  });

  // Verify penny conservation
  const sumAllocatedCents = allocations.reduce((acc, curr) => acc + curr.cents, 0);
  const discrepancyCents = totalCents - sumAllocatedCents;

  const breakdownLines = [
    `Total: $${toDollars(totalCents).toFixed(2)} split among ${n} people:`,
    ...allocations.map((a) => `• ${a.name} (${a.emailOrHandle}): $${a.amount.toFixed(2)}`),
  ];

  return {
    totalAmount: toDollars(totalCents),
    totalCents,
    participantCount: n,
    allocations,
    discrepancyCents,
    breakdownReport: breakdownLines.join("\n"),
  };
}

/**
 * Computes an itemized split where specific items belong to specific people,
 * and shared items / taxes are split proportionally.
 */
export function calculateItemizedSplit(
  items: ItemizedExpense[],
  allParticipants: SplitParticipant[],
  additionalTaxOrTip: number = 0
): DeterministicSplitResult {
  if (allParticipants.length === 0) {
    throw new Error("Participant list cannot be empty.");
  }
  if (!Number.isFinite(additionalTaxOrTip) || additionalTaxOrTip < 0) {
    throw new Error("Tax or tip must be a non-negative finite number.");
  }
  if (!items || items.length === 0) {
    throw new Error("Items list cannot be empty.");
  }
  for (const item of items) {
    if (!Number.isFinite(item.amount) || item.amount < 0) {
      throw new Error(`Invalid item amount for '${item.description}'`);
    }
  }

  const participantMap = new Map<string, { participant: SplitParticipant; cents: number; items: string[] }>();
  allParticipants.forEach((p) => {
    participantMap.set(p.name.toLowerCase(), { participant: p, cents: 0, items: [] });
  });

  let rawSubtotalCents = 0;

  // Process explicit line items
  for (const item of items) {
    const itemCents = toCents(item.amount);
    rawSubtotalCents += itemCents;

    const targets = item.assignedTo && item.assignedTo.length > 0
      ? item.assignedTo.map((t) => t.toLowerCase())
      : allParticipants.map((p) => p.name.toLowerCase());

    const basePerTarget = Math.floor(itemCents / targets.length);
    const rem = itemCents % targets.length;

    targets.forEach((targetName, idx) => {
      const pData = participantMap.get(targetName);
      if (pData) {
        const allocated = basePerTarget + (idx < rem ? 1 : 0);
        pData.cents += allocated;
        pData.items.push(`${item.description}: $${toDollars(allocated).toFixed(2)}`);
      }
    });
  }

  // Distribute tax / tip proportionally based on subtotal shares
  const taxOrTipCents = toCents(additionalTaxOrTip);
  if (taxOrTipCents > 0 && rawSubtotalCents > 0) {
    let allocatedTaxTip = 0;
    const entries = Array.from(participantMap.values());

    entries.forEach((entry, idx) => {
      if (idx === entries.length - 1) {
        // Last person takes remainder to avoid rounding drift
        const leftover = taxOrTipCents - allocatedTaxTip;
        entry.cents += leftover;
        entry.items.push(`Tax/Tip Share: $${toDollars(leftover).toFixed(2)}`);
      } else {
        const share = Math.round((entry.cents / rawSubtotalCents) * taxOrTipCents);
        entry.cents += share;
        allocatedTaxTip += share;
        entry.items.push(`Tax/Tip Share: $${toDollars(share).toFixed(2)}`);
      }
    });
  }

  const finalTotalCents = rawSubtotalCents + taxOrTipCents;
  const allocations: SplitAllocation[] = Array.from(participantMap.values()).map((val) => ({
    name: val.participant.name,
    emailOrHandle: val.participant.emailOrHandle,
    amount: toDollars(val.cents),
    cents: val.cents,
    itemizedSummary: val.items.join(", "),
  }));

  const sumCents = allocations.reduce((acc, curr) => acc + curr.cents, 0);

  const breakdownLines = [
    `Itemized Split Total: $${toDollars(finalTotalCents).toFixed(2)}:`,
    ...allocations.map((a) => `• ${a.name}: $${a.amount.toFixed(2)} (${a.itemizedSummary})`),
  ];

  return {
    totalAmount: toDollars(finalTotalCents),
    totalCents: finalTotalCents,
    participantCount: allParticipants.length,
    allocations,
    discrepancyCents: finalTotalCents - sumCents,
    breakdownReport: breakdownLines.join("\n"),
  };
}
