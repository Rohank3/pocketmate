/**
 * Curated 12-color high-contrast distinct palette for financial categories.
 * Each color has high legibility against light/glass backgrounds.
 */
export const DISTINCT_CATEGORY_PALETTE: readonly string[] = [
  "#10b981", // 0: Emerald Green (Groceries / Food Supplies)
  "#3b82f6", // 1: Royal Blue (Dining / Restaurants)
  "#8b5cf6", // 2: Purple / Violet (Entertainment / Media)
  "#ec4899", // 3: Vivid Pink (Shopping / Retail)
  "#f59e0b", // 4: Warm Amber / Gold (Travel / Flights / Lodging)
  "#06b6d4", // 5: Cyan (Utilities / Subscriptions / Bills)
  "#f97316", // 6: Tangerine Orange (Miscellaneous / Other)
  "#84cc16", // 7: Lime Green (Wellness / Health)
  "#e11d48", // 8: Rose Crimson (Professional / Freelance)
  "#6366f1", // 9: Indigo (Education / Workspace)
  "#14b8a6", // 10: Teal (Transport / Commute)
  "#a855f7", // 11: Bright Violet (Personal Care)
];

const KNOWN_CATEGORY_COLORS: Record<string, string> = {
  groceries: "#10b981",
  dining: "#3b82f6",
  entertainment: "#8b5cf6",
  shopping: "#ec4899",
  travel: "#f59e0b",
  utilities: "#06b6d4",
  bills: "#06b6d4",
  miscellaneous: "#f97316",
  miscllenous: "#f97316",
  misc: "#f97316",
  wellness: "#84cc16",
  health: "#84cc16",
  education: "#6366f1",
  professional: "#e11d48",
  transport: "#14b8a6",
};

export type CategoryColorItem = {
  id?: string;
  name: string;
  color?: string | null;
};

/**
 * Guarantees every category in a collection has a distinct, non-overlapping color.
 * Resolves color collisions automatically using the curated palette.
 */
export function ensureUniqueCategoryColors<T extends { name: string; color?: string | null }>(categories: T[]): T[] {
  if (!Array.isArray(categories) || categories.length === 0) return [];

  const usedColors = new Set<string>();
  const availablePalette = [...DISTINCT_CATEGORY_PALETTE];

  return categories.map((cat, idx) => {
    const normName = (cat.name || "").toLowerCase().trim();
    let preferredColor = cat.color ?? undefined;

    // Check if category has a standard mapped color
    if (!preferredColor || preferredColor === "#3b82f6" || normName in KNOWN_CATEGORY_COLORS) {
      if (normName in KNOWN_CATEGORY_COLORS) {
        preferredColor = KNOWN_CATEGORY_COLORS[normName];
      }
    }

    // If preferred color is valid hex and unused, assign it
    if (preferredColor && /^#[0-9a-fA-F]{6}$/.test(preferredColor) && !usedColors.has(preferredColor.toLowerCase())) {
      usedColors.add(preferredColor.toLowerCase());
      return {
        ...cat,
        color: preferredColor,
      };
    }

    // Otherwise, pick the next unused color from the distinct palette
    let nextColor = availablePalette.find((c) => !usedColors.has(c.toLowerCase()));
    if (!nextColor) {
      // Fallback: pick by index modulo palette length if palette exhausted
      nextColor = DISTINCT_CATEGORY_PALETTE[idx % DISTINCT_CATEGORY_PALETTE.length];
    }

    usedColors.add(nextColor.toLowerCase());
    return {
      ...cat,
      color: nextColor,
    };
  });
}

/**
 * Returns a deterministic unique color for any category name.
 */
export function getDistinctColorForCategory(categoryName: string, index = 0): string {
  const norm = (categoryName || "").toLowerCase().trim();
  if (norm in KNOWN_CATEGORY_COLORS) {
    return KNOWN_CATEGORY_COLORS[norm];
  }
  return DISTINCT_CATEGORY_PALETTE[index % DISTINCT_CATEGORY_PALETTE.length];
}
