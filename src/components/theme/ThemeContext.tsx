"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type ColorTheme = "light" | "dark";

export interface ThemeOption {
  id: ColorTheme;
  name: string;
  mode: "light" | "dark";
  baseColor: string;
  accentColor: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "light",
    name: "Light",
    mode: "light",
    baseColor: "#f6f8fa",
    accentColor: "#0070ba",
  },
  {
    id: "dark",
    name: "Dark",
    mode: "dark",
    baseColor: "#090d16",
    accentColor: "#0070ba",
  },
];

export interface ThemeContextValue {
  theme: ColorTheme;
  setTheme: (theme: ColorTheme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  isBlue: boolean;
  accentColor: string;
  tintColor: string;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const THEME_STORAGE_KEY = "pocketmate_color_theme";

function normalizeStoredTheme(raw: string | null): ColorTheme | null {
  if (!raw) return null;
  if (raw === "dark" || raw === "black-blue" || raw === "black-orange") return "dark";
  if (raw === "light" || raw === "white-blue" || raw === "white-orange") return "light";
  return null;
}

function getResolvedTheme(): ColorTheme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = normalizeStoredTheme(localStorage.getItem(THEME_STORAGE_KEY));
    if (saved) return saved;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch {
    // ignore storage access issues
  }
  return "light";
}

function applyThemeToDocument(resolvedTheme: ColorTheme, hasExplicitOverride: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolvedTheme);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute("content", hasExplicitOverride ? resolvedTheme : "light dark");
  }
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

    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY || e.key === null) {
        onStoreChange();
      }
    };

    const mediaQuery =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    const handleMediaChange = () => {
      try {
        if (!normalizeStoredTheme(localStorage.getItem(THEME_STORAGE_KEY))) {
          onStoreChange();
        }
      } catch {
        onStoreChange();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorage);
    }
    mediaQuery?.addEventListener("change", handleMediaChange);

    return () => {
      listeners = listeners.filter((l) => l !== onStoreChange);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorage);
      }
      mediaQuery?.removeEventListener("change", handleMediaChange);
    };
  }, []);

  const theme: ColorTheme = useSyncExternalStore<ColorTheme>(
    subscribe,
    getResolvedTheme,
    () => "light" as ColorTheme
  );

  const setTheme = useCallback((newTheme: ColorTheme) => {
    try {
      const systemMatches =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

      if (newTheme === systemMatches) {
        localStorage.removeItem(THEME_STORAGE_KEY);
        applyThemeToDocument(newTheme, false);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        applyThemeToDocument(newTheme, true);
      }
    } catch {
      applyThemeToDocument(newTheme, false);
    }
    emitChange();
  }, []);

  const toggleTheme = useCallback(() => {
    const current = getResolvedTheme();
    setTheme(current === "dark" ? "light" : "dark");
  }, [setTheme]);

  useEffect(() => {
    let hasExplicit = false;
    try {
      hasExplicit = Boolean(normalizeStoredTheme(localStorage.getItem(THEME_STORAGE_KEY)));
    } catch {
      hasExplicit = false;
    }
    applyThemeToDocument(theme, hasExplicit);
  }, [theme]);

  const isDark = theme === "dark";
  const accentColor = "#0070ba";
  const tintColor = isDark ? "#0f172a" : "#f8fafc";

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isDark,
        isBlue: true,
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
      theme: "light",
      setTheme: () => {},
      toggleTheme: () => {},
      isDark: false,
      isBlue: true,
      accentColor: "#0070ba",
      tintColor: "#f8fafc",
    };
  }
  return context;
}
