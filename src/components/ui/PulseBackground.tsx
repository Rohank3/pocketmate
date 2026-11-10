"use client";

import React, { useMemo } from "react";

export type PulseBackgroundPalette = {
  from: string;
  to: string;
  glow: string;
  ink: string;
  isDark?: boolean;
};

const LIGHT_PALETTE: PulseBackgroundPalette = {
  from: "#f6f8fa",
  to: "#edf3f9",
  glow: "#0070ba",
  ink: "#0f172a",
  isDark: false,
};

const DARK_PALETTE: PulseBackgroundPalette = {
  from: "#090d16",
  to: "#05080f",
  glow: "#0070ba",
  ink: "#f1f5f9",
  isDark: true,
};

export const PULSE_PALETTES: Record<string, PulseBackgroundPalette> = {
  light: LIGHT_PALETTE,
  dark: DARK_PALETTE,
  "white-blue": LIGHT_PALETTE,
  "white-orange": LIGHT_PALETTE,
  "black-blue": DARK_PALETTE,
  "black-orange": DARK_PALETTE,
};

export interface PulseBackgroundProps {
  palette?: keyof typeof PULSE_PALETTES | PulseBackgroundPalette | string;
  stripes?: number;
  className?: string;
  showGrain?: boolean;
}

export function stripeDelay(i: number, n: number, period = 4.8): number {
  if (n <= 0) return 0;
  return -((i / n) * period * 1.5) % period;
}

export const PulseBackground: React.FC<PulseBackgroundProps> = ({
  palette = "light",
  stripes = 18,
  className = "",
  showGrain = true,
}) => {
  const pal = useMemo(() => {
    if (typeof palette === "string") {
      return PULSE_PALETTES[palette] || LIGHT_PALETTE;
    }
    return palette;
  }, [palette]);

  const n = Math.max(1, Math.round(stripes));
  const isDark = pal.isDark ?? (pal.ink === "#f1f5f9" || pal.from.startsWith("#0"));

  const stripeGradient = isDark
    ? "linear-gradient(180deg, transparent 0%, rgba(0, 112, 186, 0.14) 22%, rgba(56, 189, 248, 0.34) 58%, rgba(0, 140, 255, 0.42) 86%, transparent 100%)"
    : "linear-gradient(180deg, transparent, rgba(0, 112, 186, 0.04) 25%, rgba(0, 112, 186, 0.12) 60%, rgba(0, 70, 124, 0.18) 90%, transparent 100%)";

  const breathingLamp = isDark
    ? "radial-gradient(closest-side, rgba(0, 140, 255, 0.34), rgba(56, 189, 248, 0.16), transparent)"
    : "radial-gradient(closest-side, rgba(0, 112, 186, 0.14), rgba(0, 121, 193, 0.07), transparent)";

  const topLamp = isDark
    ? "radial-gradient(closest-side, rgba(56, 189, 248, 0.24), rgba(0, 112, 186, 0.14), transparent)"
    : "radial-gradient(closest-side, rgba(0, 121, 193, 0.12), rgba(0, 112, 186, 0.05), transparent)";

  const centerBloom = isDark
    ? "radial-gradient(closest-side, rgba(56, 189, 248, 0.18), transparent)"
    : "radial-gradient(closest-side, rgba(0, 112, 186, 0.09), transparent)";

  const vignette = isDark
    ? "radial-gradient(80% 65% at 50% 38%, transparent 50%, rgba(3, 6, 12, 0.42) 96%)"
    : "radial-gradient(75% 60% at 50% 35%, transparent 55%, rgba(203, 213, 225, 0.28) 92%)";

  const stripeBorderClass = isDark
    ? "border-sky-400/[0.12]"
    : "border-slate-900/[0.035]";

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-0 overflow-hidden select-none transition-colors duration-500 ${className}`}
      style={
        {
          "--psh-from": pal.from,
          "--psh-to": pal.to,
          "--psh-glow": pal.glow,
          "--psh-ink": pal.ink,
          background: `linear-gradient(180deg, var(--psh-from) 0%, var(--psh-to) 100%)`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {/* Vertical Travelling Pulse Stripes */}
      <div className={`absolute inset-0 flex ${isDark ? "opacity-95" : "opacity-90"}`}>
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            className={`relative flex-1 h-full overflow-hidden border-r ${stripeBorderClass}`}
          >
            <div
              className={`absolute left-0 right-0 h-3/5 -top-[60%] will-change-transform ${
                isDark ? "blur-[6px] opacity-85" : "blur-[8px] opacity-75"
              }`}
              style={{
                background: stripeGradient,
                animation: `psh-pulse 5.4s cubic-bezier(.45, 0, .25, 1) infinite`,
                animationDelay: `${stripeDelay(i, n, 5.4)}s`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Breathing Lamp Glow at Bottom */}
      <div
        className="absolute -left-[10%] -right-[10%] -bottom-[30%] h-[70%] rounded-[50%] blur-3xl pointer-events-none opacity-50"
        style={{
          background: breathingLamp,
          animation: `psh-breathe 8s ease-in-out infinite`,
        }}
      />

      {/* Top Ambient Vignette Lamp */}
      <div
        className="absolute -left-[15%] -right-[15%] -top-[25%] h-[55%] rounded-[50%] blur-3xl pointer-events-none opacity-45"
        style={{
          background: topLamp,
        }}
      />

      {/* Center Subtle Ambient Light Bloom */}
      <div
        className="absolute left-[20%] right-[20%] top-[20%] h-[50%] rounded-[50%] blur-3xl pointer-events-none opacity-30"
        style={{
          background: centerBloom,
        }}
      />

      {/* Radial Shade / Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: vignette,
        }}
      />

      {/* Analog Noise Texture Overlay */}
      {showGrain && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.12] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      )}
    </div>
  );
};

export default PulseBackground;
