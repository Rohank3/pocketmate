export interface SubscriptionLifecycle {
  cleanName: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  isCancelled: boolean;
  contractStatus: string;
}

/**
 * Extracts subscription lifecycle details (Start Date, End Date, Ongoing status, Cancellation)
 * from stored counterparty metadata or falls back to event date.
 */
export function extractLifecycle(
  counterparty?: string | null,
  fallbackDate?: string,
  referenceDateStr?: string
): SubscriptionLifecycle {
  const todayStr = referenceDateStr || new Date().toISOString().slice(0, 10);

  if (!counterparty) {
    return {
      cleanName: "",
      startDate: fallbackDate || "",
      endDate: null,
      isOngoing: true,
      isCancelled: false,
      contractStatus: "Ongoing / Renews Monthly",
    };
  }

  // Regex pattern matching: "Provider [Start: YYYY-MM-DD | End: YYYY-MM-DD]" or "Provider [Start: YYYY-MM-DD | Ongoing]"
  const match = counterparty.match(
    /^(.*?)\s*\[Start:\s*([^|\]]+)(?:\|\s*(?:End:\s*([^\]]+)|(Ongoing)))?\]$/i
  );

  if (match) {
    const cleanName = match[1].trim();
    const startDate = match[2].trim();
    const endDate = match[3]?.trim() || null;
    const isOngoing = !endDate;
    const isCancelled = Boolean(endDate && endDate <= todayStr);

    let contractStatus = "Ongoing / Renews Monthly";
    if (isCancelled) {
      contractStatus = `Cancelled on ${endDate}`;
    } else if (endDate) {
      contractStatus = `Contract Ends: ${endDate}`;
    }

    return {
      cleanName: cleanName || counterparty,
      startDate,
      endDate,
      isOngoing,
      isCancelled,
      contractStatus,
    };
  }

  return {
    cleanName: counterparty,
    startDate: fallbackDate || "",
    endDate: null,
    isOngoing: true,
    isCancelled: false,
    contractStatus: "Ongoing / Renews Monthly",
  };
}

/**
 * Encodes subscription lifecycle dates into the counterparty string in a backwards-compatible manner.
 */
export function formatCounterpartyWithLifecycle(
  name: string,
  startDate?: string,
  endDate?: string
): string {
  const trimmedName = name.trim();
  const start = startDate ? startDate.trim() : "";
  const end = endDate ? endDate.trim() : "";

  if (!start && !end) return trimmedName;

  if (end) {
    return `${trimmedName} [Start: ${start || "Initial"} | End: ${end}]`;
  }
  return `${trimmedName} [Start: ${start || "Initial"} | Ongoing]`;
}

/**
 * Stamps a cancellation date onto a counterparty string so future months stop showing the bill.
 */
export function cancelSubscriptionCounterparty(
  counterparty?: string | null,
  cancellationDateStr?: string
): string {
  const cancelDate = cancellationDateStr || new Date().toISOString().slice(0, 10);
  const lifecycle = extractLifecycle(counterparty);
  const start = lifecycle.startDate || cancelDate;
  return `${lifecycle.cleanName} [Start: ${start} | End: ${cancelDate}]`;
}

/**
 * Determines whether a recurring event is active and should appear on a specific calendar date:
 * - If it has an explicit endDate (e.g. 3-year Spotify Student plan): active strictly until endDate.
 * - If ongoing / open-ended:
 *   - Weekly: projected up to 25 weeks ahead from startDate / today.
 *   - Monthly: projected up to 12 months ahead from startDate / today.
 *   - Yearly: projected up to 5 years ahead from startDate / today.
 * - Before startDate: inactive (does not appear before it began).
 * - After endDate (or cancellation date): inactive.
 */
export function isEventActiveOnDate(
  event: {
    date: string;
    dayOfMonth: number;
    counterparty?: string | null;
  },
  cellDateStr: string,
  cellDay: number,
  frequency: "weekly" | "monthly" | "yearly" = "monthly",
  currentDateRef?: string
): boolean {
  const lifecycle = extractLifecycle(event.counterparty, event.date);
  const todayStr = currentDateRef || new Date().toISOString().slice(0, 10);

  // 1. Start date check: cannot appear before the subscription started
  if (lifecycle.startDate && cellDateStr < lifecycle.startDate) {
    return false;
  }

  // 2. Explicit End Date check (e.g. 3-year plan ending 2028-11-15, or cancelled on 2026-11-07)
  if (lifecycle.endDate) {
    if (cellDateStr > lifecycle.endDate) {
      return false; // Beyond contract or cancellation end date
    }
  } else {
    // 3. Ongoing / open-ended projection horizon check
    // Base projection from whichever is later: subscription start date or current today date
    const baseAnchorStr = lifecycle.startDate && lifecycle.startDate > todayStr
      ? lifecycle.startDate
      : todayStr;

    const [anchorY, anchorM, anchorD] = baseAnchorStr.split("-").map(Number);
    const maxHorizonDate = new Date(anchorY, anchorM - 1, anchorD || 1);

    if (frequency === "weekly") {
      maxHorizonDate.setDate(maxHorizonDate.getDate() + 25 * 7); // 25 weeks
    } else if (frequency === "yearly") {
      maxHorizonDate.setFullYear(maxHorizonDate.getFullYear() + 5); // 5 years
    } else {
      // Monthly (default): 12 months forward projection
      maxHorizonDate.setMonth(maxHorizonDate.getMonth() + 12);
    }

    const maxHorizonStr = `${maxHorizonDate.getFullYear()}-${String(maxHorizonDate.getMonth() + 1).padStart(2, "0")}-${String(maxHorizonDate.getDate()).padStart(2, "0")}`;

    if (cellDateStr > maxHorizonStr) {
      return false; // Beyond 12-month / 25-week / 5-year rolling horizon
    }
  }

  // 4. Calendar alignment match: exact date match or recurring day of month
  if (event.date === cellDateStr) return true;
  if (event.dayOfMonth === cellDay) return true;

  return false;
}
