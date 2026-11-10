"use client";

import React, { useEffect, useState } from "react";

export interface LiquidWaveProps {
  height?: number;
  className?: string;
  isActive?: boolean;
}

/**
 * Organic dual-harmonic liquid wave component.
 * Displays undulating molten champagne gold / amber fluid streams
 * with glowing specular crests and continuous physical wave movement.
 */
export const LiquidWave: React.FC<LiquidWaveProps> = ({
  height = 24,
  className = "",
  isActive = true,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`w-full overflow-hidden pointer-events-none relative ${className}`}
        style={{ height }}
      >
        <div className="w-full h-[3px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600" />
      </div>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden pointer-events-none relative select-none ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <svg
        className="w-[200%] h-full absolute top-0 left-0 will-change-transform"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        style={{
          animation: isActive ? "liquid-wave-flow 6.5s linear infinite" : "none",
        }}
      >
        <defs>
          {/* Main Gold Fluid Gradient */}
          <linearGradient id="liquidGoldDeep" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d97706" stopOpacity="0.45" />
            <stop offset="25%" stopColor="#f59e0b" stopOpacity="0.65" />
            <stop offset="50%" stopColor="#fef08a" stopOpacity="0.85" />
            <stop offset="75%" stopColor="#f59e0b" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0.45" />
          </linearGradient>

          {/* Harmonic Secondary Fluid Gradient */}
          <linearGradient id="liquidGoldSecondary" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#b45309" stopOpacity="0.25" />
            <stop offset="30%" stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#fbbf24" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#b45309" stopOpacity="0.25" />
          </linearGradient>

          {/* Shimmer Specular Crest */}
          <linearGradient id="liquidShimmerCrest" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Back Layer Harmonic Sine Wave */}
        <path
          d="M 0,35 C 150,85 300,5 450,45 C 600,85 750,15 900,50 C 1050,85 1200,20 1200,20 L 1200,0 L 0,0 Z"
          fill="url(#liquidGoldSecondary)"
          style={{
            transform: "translateY(5px)",
          }}
        />

        {/* Primary Foreground Wave */}
        <path
          d="M 0,20 C 150,55 300,5 450,25 C 600,50 750,5 900,30 C 1050,60 1200,15 1200,15 L 1200,0 L 0,0 Z"
          fill="url(#liquidGoldDeep)"
        />

        {/* Glowing Specular Crest Line */}
        <path
          d="M 0,20 C 150,55 300,5 450,25 C 600,50 750,5 900,30 C 1050,60 1200,15 1200,15"
          fill="none"
          stroke="url(#liquidShimmerCrest)"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="opacity-80"
        />
      </svg>

      {/* Counter-drifting harmonic secondary wave for organic fluid depth */}
      <svg
        className="w-[200%] h-full absolute top-0 left-[-50%] will-change-transform opacity-70"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        style={{
          animation: isActive ? "liquid-wave-reverse 9s linear infinite" : "none",
        }}
      >
        <path
          d="M 0,25 C 200,60 400,10 600,35 C 800,65 1000,15 1200,30 L 1200,0 L 0,0 Z"
          fill="url(#liquidGoldSecondary)"
        />
      </svg>

      {/* Ambient bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
    </div>
  );
};
