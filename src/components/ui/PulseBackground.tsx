"use client";

import React, { useMemo } from "react";

export type PulseBackgroundPalette = {
  from: string;
  to: string;
  glow: string;
  ink: string;
};

export const PULSE_PALETTES: Record<string, PulseBackgroundPalette> = {
  // Executive Warm Ivory & Champagne Gold (Signature Single Modern Luxury Theme)
  gold: {
    from: "#fbf9f4",
    to: "#f1ebe0",
    glow: "#f59e0b",
    ink: "#18181b",
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
      <div className="absolute inset-0 flex opacity-90">
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            className="relative flex-1 h-full overflow-hidden border-r border-amber-900/[0.05]"
          >
            <div
              className="absolute left-0 right-0 h-3/5 -top-[60%] blur-[8px] opacity-75 will-change-transform"
              style={{
                background: `linear-gradient(180deg, transparent, rgba(245, 158, 11, 0.05) 25%, rgba(251, 191, 36, 0.18) 60%, rgba(217, 119, 6, 0.28) 90%, transparent 100%)`,
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
          background: `radial-gradient(closest-side, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.1), transparent)`,
          animation: `psh-breathe 8s ease-in-out infinite`,
        }}
      />

      {/* Top Ambient Vignette Lamp */}
      <div
        className="absolute -left-[15%] -right-[15%] -top-[25%] h-[55%] rounded-[50%] blur-3xl pointer-events-none opacity-45"
        style={{
          background: `radial-gradient(closest-side, rgba(251, 191, 36, 0.18), rgba(245, 158, 11, 0.08), transparent)`,
        }}
      />

      {/* Center Subtle Champagne Ambient Light Bloom */}
      <div
        className="absolute left-[20%] right-[20%] top-[20%] h-[50%] rounded-[50%] blur-3xl pointer-events-none opacity-30"
        style={{
          background: `radial-gradient(closest-side, rgba(245, 158, 11, 0.15), transparent)`,
        }}
      />

      {/* Radial Shade / Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(75% 60% at 50% 35%, transparent 50%, rgba(230, 222, 210, 0.35) 90%)`,
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
