"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeContext";

/**
 * Minimal icon-only Sun/Moon toggle between Light and Dark themes.
 * Uses CSS attribute selectors for initial icon visibility to prevent SSR hydration flicker.
 */
export const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="theme-toggle-btn w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]"
    >
      <Sun className="w-4 h-4 theme-icon-sun" aria-hidden="true" />
      <Moon className="w-4 h-4 theme-icon-moon" aria-hidden="true" />
      <span className="sr-only">
        {isDark ? "Switch to light theme" : "Switch to dark theme"}
      </span>
    </button>
  );
};

export default ThemeToggle;
