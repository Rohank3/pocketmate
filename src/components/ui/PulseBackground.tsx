"use client";

import React, { useMemo } from "react";

export type PulseBackgroundPalette = {
  from: string;
  to: string;
  glow: string;
  ink: string;
};

export const PULSE_PALETTES: Record<string, PulseBackgroundPalette> = {
  // White & Orange (Default Executive Warm Ivory & Champagne Gold)
  "white-orange": {
    from: "#fbf9f4",
    to: "#f1ebe0",
    glow: "#f59e0b",
    ink: "#18181b",
  },
  gold: {
    from: "#fbf9f4",
    to: "#f1ebe0",
    glow: "#f59e0b",
    ink: "#18181b",
  },
  // White & PayPal Blue
  "white-blue": {
    from: "#f8fafc",
    to: "#edf4fb",
    glow: "#0070ba",
    ink: "#18181b",
  },
  // Black & PayPal Blue
  "black-blue": {
    from: "#09090b",
    to: "#040406",
    glow: "#0070ba",
    ink: "#f4f4f5",
  },
  // Black & Orange
  "black-orange": {
    from: "#09090b",
    to: "#050302",
    glow: "#f59e0b",
    ink: "#f4f4f5",
  },
  // Paper Linen warm tone
  paper: {
    from: "#fdfbf7",
    to: "#f3efe6",
    glow: "#d97706",
    ink: "#18181b",
  },
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
  palette = "white-orange",
  stripes = 18,
  className = "",
  showGrain = true,
}) => {
  const pal = useMemo(() => {
    if (typeof palette === "string") {
      return PULSE_PALETTES[palette] || PULSE_PALETTES["white-orange"];
    }
    return palette;
  }, [palette]);

  const n = Math.max(1, Math.round(stripes));
  const isBlue = pal.glow === "#0070ba";
  const isDark = pal.ink === "#f4f4f5" || pal.from.startsWith("#0");

  const stripeGradient = isBlue
    ? `linear-gradient(180deg, transparent, rgba(0, 112, 186, 0.05) 25%, rgba(0, 121, 193, 0.18) 60%, rgba(0, 70, 124, 0.28) 90%, transparent 100%)`
    : `linear-gradient(180deg, transparent, rgba(245, 158, 11, 0.05) 25%, rgba(251, 191, 36, 0.18) 60%, rgba(217, 119, 6, 0.28) 90%, transparent 100%)`;

  const breathingLamp = isBlue
    ? isDark
      ? `radial-gradient(closest-side, rgba(0, 112, 186, 0.32), rgba(0, 121, 193, 0.18), transparent)`
      : `radial-gradient(closest-side, rgba(0, 112, 186, 0.2), rgba(0, 121, 193, 0.1), transparent)`
    : isDark
    ? `radial-gradient(closest-side, rgba(245, 158, 11, 0.28), rgba(251, 191, 36, 0.15), transparent)`
    : `radial-gradient(closest-side, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.1), transparent)`;

  const topLamp = isBlue
    ? isDark
      ? `radial-gradient(closest-side, rgba(0, 121, 193, 0.25), rgba(0, 112, 186, 0.12), transparent)`
      : `radial-gradient(closest-side, rgba(0, 121, 193, 0.18), rgba(0, 112, 186, 0.08), transparent)`
    : isDark
    ? `radial-gradient(closest-side, rgba(251, 191, 36, 0.22), rgba(245, 158, 11, 0.1), transparent)`
    : `radial-gradient(closest-side, rgba(251, 191, 36, 0.18), rgba(245, 158, 11, 0.08), transparent)`;

  const centerBloom = isBlue
    ? `radial-gradient(closest-side, rgba(0, 112, 186, 0.15), transparent)`
    : `radial-gradient(closest-side, rgba(245, 158, 11, 0.15), transparent)`;

  const vignette = isDark
    ? `radial-gradient(75% 60% at 50% 35%, transparent 40%, rgba(0, 0, 0, 0.8) 95%)`
    : isBlue
    ? `radial-gradient(75% 60% at 50% 35%, transparent 50%, rgba(210, 225, 240, 0.35) 90%)`
    : `radial-gradient(75% 60% at 50% 35%, transparent 50%, rgba(230, 222, 210, 0.35) 90%)`;

  const stripeBorderClass = isDark
    ? isBlue
      ? "border-sky-500/[0.08]"
      : "border-amber-500/[0.08]"
    : isBlue
    ? "border-blue-900/[0.05]"
    : "border-amber-900/[0.05]";

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
      <div className="absolute inset-0 flex opacity-90">
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            className={`relative flex-1 h-full overflow-hidden border-r ${stripeBorderClass}`}
          >
            <div
              className="absolute left-0 right-0 h-3/5 -top-[60%] blur-[8px] opacity-75 will-change-transform"
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
          className="absolute inset-0 pointer-events-none opacity-[0.14] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      )}
    </div>
  );
};

export default PulseBackground;
