"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type ColorTheme = "white-orange" | "white-blue" | "black-blue" | "black-orange";

export interface ThemeOption {
  id: ColorTheme;
  name: string;
  description: string;
  mode: "light" | "dark";
  accent: "orange" | "blue";
  baseColor: string;
  accentColor: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "white-orange",
    name: "White & Orange",
    description: "Light ivory canvas with champagne gold & warm amber",
    mode: "light",
    accent: "orange",
    baseColor: "#fbfbfa",
    accentColor: "#f59e0b",
  },
  {
    id: "white-blue",
    name: "White & PayPal Blue",
    description: "Crisp white canvas with official PayPal signature blue",
    mode: "light",
    accent: "blue",
    baseColor: "#f8fafc",
    accentColor: "#0070ba",
  },
  {
    id: "black-blue",
    name: "Black & PayPal Blue",
    description: "Deep obsidian dark glass with vibrant PayPal blue",
    mode: "dark",
    accent: "blue",
    baseColor: "#09090b",
    accentColor: "#0070ba",
  },
  {
    id: "black-orange",
    name: "Black & Orange",
    description: "Deep obsidian dark glass with vivid amber & orange",
    mode: "dark",
    accent: "orange",
    baseColor: "#09090b",
    accentColor: "#f59e0b",
  },
];

export interface ThemeContextValue {
  theme: ColorTheme;
  setTheme: (theme: ColorTheme) => void;
  isDark: boolean;
  isBlue: boolean;
  accentColor: string;
  tintColor: string;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "pocketmate_color_theme";

function getStoredTheme(): ColorTheme {
  if (typeof window === "undefined") return "white-orange";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ColorTheme | null;
    if (saved && THEME_OPTIONS.some((t) => t.id === saved)) {
      return saved;
    }
  } catch {
    // fallback
  }
  return "white-orange";
}

let listeners: Array<() => void> = [];
function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.push(onStoreChange);
    return () => {
      listeners = listeners.filter((l) => l !== onStoreChange);
    };
  }, []);

  const theme: ColorTheme = useSyncExternalStore<ColorTheme>(
    subscribe,
    getStoredTheme,
    () => "white-orange" as ColorTheme
  );

  const setTheme = useCallback((newTheme: ColorTheme) => {
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
      document.documentElement.setAttribute("data-theme", newTheme);
    } catch {
      // ignore
    }
    emitChange();
  }, []);

  // Update data-theme attribute on client
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const isDark = theme.startsWith("black");
  const isBlue = theme.endsWith("blue");
  const accentColor = isBlue ? "#0070ba" : "#f59e0b";
  const tintColor = isDark ? "#121218" : (isBlue ? "#f8fafc" : "#fdfbf7");

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        isDark,
        isBlue,
        accentColor,
        tintColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: "white-orange",
      setTheme: () => {},
      isDark: false,
      isBlue: false,
      accentColor: "#f59e0b",
      tintColor: "#fdfbf7",
    };
  }
  return context;
}
