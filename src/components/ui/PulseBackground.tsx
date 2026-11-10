"use client";

import React, { useMemo } from "react";

export type PulseBackgroundPalette = {
  from: string;
  to: string;
  glow: string;
  ink: string;
};

export const PULSE_PALETTES: Record<string, PulseBackgroundPalette> = {
  // Champagne & Warm Obsidian Gold (Signature Single Modern Luxury Theme)
  gold: {
    from: "#140f09",
    to: "#060504",
    glow: "#f59e0b",
    ink: "#fdf8ee",
  },
  // Sodium streetlamp warm amber glow
  sodium: {
    from: "#18120b",
    to: "#060504",
    glow: "#f59e0b",
    ink: "#fbf6ee",
  },
  midnight: {
    from: "#140f09",
    to: "#060504",
    glow: "#f59e0b",
    ink: "#fdf8ee",
  },
};

export interface PulseBackgroundProps {
  palette?: keyof typeof PULSE_PALETTES | PulseBackgroundPalette;
  stripes?: number;
  className?: string;
  showGrain?: boolean;
}

export function stripeDelay(i: number, n: number, period = 4.8): number {
  if (n <= 0) return 0;
  return -((i / n) * period * 1.5) % period;
}

export const PulseBackground: React.FC<PulseBackgroundProps> = ({
  palette = "gold",
  stripes = 18,
  className = "",
  showGrain = true,
}) => {
  const pal = useMemo(() => {
    return typeof palette === "string"
      ? PULSE_PALETTES[palette] || PULSE_PALETTES.gold
      : palette;
  }, [palette]);

  const n = Math.max(1, Math.round(stripes));

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-0 overflow-hidden select-none ${className}`}
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
      <div className="absolute inset-0 flex opacity-60">
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            className="relative flex-1 h-full overflow-hidden border-r border-white/[0.035]"
          >
            <div
              className="absolute left-0 right-0 h-1/2 -top-[60%] blur-[8px] opacity-40 will-change-transform"
              style={{
                background: `linear-gradient(180deg, transparent, color-mix(in oklab, var(--psh-glow) 20%, transparent) 45%, color-mix(in oklab, var(--psh-glow) 60%, transparent) 80%, var(--psh-glow) 95%, transparent 100%)`,
                animation: `psh-pulse 5.4s cubic-bezier(.45, 0, .25, 1) infinite`,
                animationDelay: `${stripeDelay(i, n, 5.4)}s`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Breathing Lamp Glow at Bottom */}
      <div
        className="absolute -left-[15%] -right-[15%] -bottom-[35%] h-[75%] rounded-[50%] blur-3xl pointer-events-none opacity-60"
        style={{
          background: `radial-gradient(closest-side, color-mix(in oklab, var(--psh-glow) 35%, transparent), transparent)`,
          animation: `psh-breathe 8s ease-in-out infinite`,
        }}
      />

      {/* Top Ambient Vignette Lamp */}
      <div
        className="absolute -left-[20%] -right-[20%] -top-[30%] h-[60%] rounded-[50%] blur-3xl pointer-events-none opacity-40"
        style={{
          background: `radial-gradient(closest-side, color-mix(in oklab, var(--psh-glow) 20%, transparent), transparent)`,
        }}
      />

      {/* Radial Shade / Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(75% 60% at 50% 35%, transparent 30%, color-mix(in oklab, var(--psh-to) 60%, transparent) 85%)`,
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
