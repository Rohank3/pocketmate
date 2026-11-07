export interface SubscriptionLifecycle {
  cleanName: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  contractStatus: string;
}

/**
 * Extracts subscription lifecycle details (Start Date, End Date, Ongoing status)
 * from stored counterparty metadata or falls back to event date.
 */
export function extractLifecycle(
  counterparty?: string | null,
  fallbackDate?: string
): SubscriptionLifecycle {
  if (!counterparty) {
    return {
      cleanName: "",
      startDate: fallbackDate || "",
      endDate: null,
      isOngoing: true,
      contractStatus: "Ongoing / Renews Monthly",
    };
  }

  // Regex match pattern: "Provider Name [Start: YYYY-MM-DD | End: YYYY-MM-DD]" or "Provider Name [Start: YYYY-MM-DD | Ongoing]"
  const match = counterparty.match(
    /^(.*?)\s*\[Start:\s*([^|\]]+)(?:\|\s*(?:End:\s*([^\]]+)|(Ongoing)))?\]$/i
  );

  if (match) {
    const cleanName = match[1].trim();
    const startDate = match[2].trim();
    const endDate = match[3]?.trim() || null;
    const isOngoing = !endDate;
    return {
      cleanName: cleanName || counterparty,
      startDate,
      endDate,
      isOngoing,
      contractStatus: endDate ? `Contract Ends: ${endDate}` : "Ongoing / Renews Monthly",
    };
  }

  return {
    cleanName: counterparty,
    startDate: fallbackDate || "",
    endDate: null,
    isOngoing: true,
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
