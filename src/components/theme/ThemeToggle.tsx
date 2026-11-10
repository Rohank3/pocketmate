"use client";

import React, { useState, useRef, useEffect } from "react";
import { Palette, Check, ChevronDown } from "lucide-react";
import { useTheme, THEME_OPTIONS } from "./ThemeContext";

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const activeOption = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select color theme"
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 border border-stone-200 hover:border-amber-400/50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none backdrop-blur-md text-xs text-zinc-800 shadow-xs transition-all cursor-pointer active:scale-[0.98]"
      >
        <Palette className="w-3.5 h-3.5 text-zinc-500 shrink-0" />

        {/* Dual color swatch preview */}
        <span className="flex items-center -space-x-1 shrink-0" aria-hidden="true">
          <span
            className="w-3 h-3 rounded-full border border-stone-300 shadow-2xs inline-block"
            style={{ backgroundColor: activeOption.baseColor }}
          />
          <span
            className="w-3 h-3 rounded-full border border-white/60 shadow-2xs inline-block"
            style={{ backgroundColor: activeOption.accentColor }}
          />
        </span>

        <span className="font-semibold text-zinc-900 truncate max-w-[120px] sm:max-w-none">
          {activeOption.name}
        </span>

        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-zinc-700" : ""
          }`}
        />
      </button>

      {/* Flyout Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Color themes"
          className="absolute right-0 top-[calc(100%+8px)] w-72 p-2 rounded-2xl glass-dropdown z-50 shadow-xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-2.5 py-1.5 mb-1 border-b border-stone-200/80">
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-zinc-500">
              Color Theme
            </span>
          </div>

          <div className="space-y-1">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = opt.id === theme;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setTheme(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    isSelected
                      ? "bg-amber-500/10 border border-amber-400/40 text-zinc-900 shadow-2xs"
                      : "hover:bg-stone-100/70 border border-transparent text-zinc-700 hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Visual Swatch Preview Box */}
                    <div
                      className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 relative overflow-hidden shadow-2xs"
                      style={{
                        backgroundColor: opt.baseColor,
                        borderColor: opt.mode === "dark" ? "rgba(255,255,255,0.15)" : "#e2e8f0",
                      }}
                      aria-hidden="true"
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shadow-xs"
                        style={{ backgroundColor: opt.accentColor }}
                      />
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold leading-snug truncate">
                        {opt.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 leading-snug truncate">
                        {opt.mode === "dark" ? "Dark canvas" : "Light canvas"} ·{" "}
                        {opt.accent === "blue" ? "PayPal Blue" : "Warm Orange"}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-amber-600 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
