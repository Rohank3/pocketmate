"use client";

import React, {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTheme } from "@/components/theme/ThemeContext";

export interface ElasticChatBubbleProps {
  role: "user" | "assistant";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  intensity?: number; // 0..1.5, default 0.75 for subtle snappy 6-12px flex
}

interface Edge {
  value: number;
  velocity: number;
  target: number;
  center: number;
}

interface Point {
  x: number;
  y: number;
}

const PADDING = 20;

const smoothstep = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

const clamp = (val: number | undefined, min: number, max: number, fallback: number) => {
  if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
};

export const ElasticChatBubble: React.FC<ElasticChatBubbleProps> = ({
  role,
  children,
  className = "",
  style,
  intensity = 0.75,
}) => {
  const { isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipRef = useRef<SVGPathElement>(null);
  const rimGlowRef = useRef<SVGPathElement>(null);
  const rimRef = useRef<SVGPathElement>(null);

  const clipId = "elastic-bubble-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const amount = clamp(intensity, 0, 1.5, 0.75);

  // Asymmetric chat bubble corner radii:
  // User: rounded-2xl rounded-tr-xs (top-right speech corner flat)
  // Assistant: rounded-2xl rounded-tl-xs (top-left speech corner flat)
  const isUser = role === "user";
  const rTL = isUser ? 18 : 4;
  const rTR = isUser ? 4 : 18;
  const rBR = 18;
  const rBL = 18;

  useEffect(() => {
    const container = containerRef.current;
    const surface = svgRef.current;
    const outline = rimRef.current;
    const outlineGlow = rimGlowRef.current;
    const clipping = clipRef.current;

    if (!container || !surface || !outline || !outlineGlow || !clipping) return;

    const edges: Edge[] = Array.from({ length: 4 }, () => ({
      value: 0,
      velocity: 0,
      target: 0,
      center: 0,
    }));

    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      initialized: false,
    };

    let width = Math.max(1, container.offsetWidth);
    let height = Math.max(1, container.offsetHeight);
    let raf = 0;
    let last = 0;
    let inView = true;
    let hasPointer = false;
    let disposed = false;

    const round = (n: number) => Number(n.toFixed(2));
    const p = (pt: Point) => `${round(pt.x + PADDING)} ${round(pt.y + PADDING)}`;

    function bend(at: number, length: number, startR: number, endR: number, edge: Edge) {
      if (amount <= 0) return 0;
      const taper = smoothstep((at - startR) / 14) * smoothstep((length - endR - at) / 14);
      return edge.value * Math.exp(-((at - edge.center) ** 2) / (2 * 45 * 45)) * taper;
    }

    function draw() {
      let d = "M" + p({ x: rTL, y: 0 });

      function curve(point: (t: number) => Point, length: number) {
        const count = Math.max(8, Math.min(48, Math.ceil(length / 10)));
        const step = 1 / count;
        const tangent = (t: number) => {
          const a = point(t - 0.001);
          const b = point(t + 0.001);
          return { x: (b.x - a.x) / 0.002, y: (b.y - a.y) / 0.002 };
        };
        for (let i = 0; i < count; i++) {
          const t = i * step;
          const a = point(t);
          const b = point(t + step);
          const ta = tangent(t);
          const tb = tangent(t + step);
          d += ` C${p({ x: a.x + (ta.x * step) / 3, y: a.y + (ta.y * step) / 3 })} ${p({
            x: b.x - (tb.x * step) / 3,
            y: b.y - (tb.y * step) / 3,
          })} ${p(b)}`;
        }
      }

      // Top edge (moves outward into negative y)
      curve(
        (t) => {
          const x = rTL + t * (width - rTL - rTR);
          return { x, y: -bend(x, width, rTL, rTR, edges[0]) };
        },
        width - rTL - rTR
      );
      // Top-right corner
      d += ` Q${p({ x: width, y: 0 })} ${p({ x: width, y: rTR })}`;

      // Right edge (moves outward into positive x)
      curve(
        (t) => {
          const y = rTR + t * (height - rTR - rBR);
          return { x: width + bend(y, height, rTR, rBR, edges[1]), y };
        },
        height - rTR - rBR
      );
      // Bottom-right corner
      d += ` Q${p({ x: width, y: height })} ${p({ x: width - rBR, y: height })}`;

      // Bottom edge (moves outward into positive y)
      curve(
        (t) => {
          const x = width - rBR - t * (width - rBR - rBL);
          return { x, y: height + bend(x, width, rBL, rBR, edges[2]) };
        },
        width - rBR - rBL
      );
      // Bottom-left corner
      d += ` Q${p({ x: 0, y: height })} ${p({ x: 0, y: height - rBL })}`;

      // Left edge (moves outward into negative x)
      curve(
        (t) => {
          const y = height - rBL - t * (height - rBL - rTL);
          return { x: -bend(y, height, rTL, rBL, edges[3]), y };
        },
        height - rBL - rTL
      );
      // Top-left corner
      d += ` Q${p({ x: 0, y: 0 })} ${p({ x: rTL, y: 0 })} Z`;

      outline!.setAttribute("d", d);
      outlineGlow!.setAttribute("d", d);
      clipping!.setAttribute("d", d);
    }

    function targets() {
      if (amount <= 0 || !hasPointer) {
        edges.forEach((e) => {
          e.target = 0;
        });
        return;
      }

      const locations = [
        { at: pointer.x, out: -pointer.y, length: width, startR: rTL, endR: rTR },
        { at: pointer.y, out: pointer.x - width, length: height, startR: rTR, endR: rBR },
        { at: pointer.x, out: pointer.y - height, length: width, startR: rBL, endR: rBR },
        { at: pointer.y, out: -pointer.x, length: height, startR: rTL, endR: rBL },
      ];

      locations.forEach(({ at, out, length, startR, endR }, i) => {
        const edge = edges[i];
        if (at > startR && at < length - endR && Math.abs(out) < 65) {
          edge.center = at;
          const proximity = smoothstep(1 - Math.abs(out) / 65);
          // Subtle, snappy flex: max 10px bulge
          const pull = 11 - Math.abs(out) * 0.12;
          edge.target = Math.max(0, Math.min(11, pull)) * proximity * amount;
        } else {
          edge.target = 0;
        }
      });
    }

    function tick(now: number) {
      raf = 0;
      if (disposed || !inView || document.hidden) {
        last = 0;
        return;
      }
      const dt = Math.min(0.04, Math.max(0.001, (now - (last || now - 16.67)) / 1000));
      last = now;

      const follow = 1 - Math.exp(-26 * dt);
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;

      targets();

      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / steps;
      for (let step = 0; step < steps; step++) {
        for (const edge of edges) {
          // Snappy harmonic spring with quick damping
          edge.velocity += (-360 * (edge.value - edge.target) - 24 * edge.velocity) * h;
          edge.value += edge.velocity * h;
          if (Math.abs(edge.value) > 14) {
            edge.value = Math.sign(edge.value) * 14;
            edge.velocity = 0;
          }
        }
      }

      draw();

      const unsettled =
        edges.some((e) => Math.abs(e.value - e.target) > 0.02 || Math.abs(e.velocity) > 0.06) ||
        (hasPointer && Math.abs(pointer.x - pointer.targetX) + Math.abs(pointer.y - pointer.targetY) > 0.1);

      if (unsettled) {
        wake();
      } else {
        edges.forEach((e) => {
          e.value = e.target;
          e.velocity = 0;
        });
        draw();
        last = 0;
      }
    }

    function wake() {
      if (inView && !document.hidden && !disposed && !raf) {
        raf = requestAnimationFrame(tick);
      }
    }

    function reset() {
      hasPointer = false;
      pointer.initialized = false;
      edges.forEach((e) => {
        e.target = 0;
      });
      wake();
    }

    function locate(event: PointerEvent) {
      const bounds = container!.getBoundingClientRect();
      return {
        x: ((event.clientX - bounds.left) * width) / bounds.width,
        y: ((event.clientY - bounds.top) * height) / bounds.height,
      };
    }

    function handlePointerMove(event: PointerEvent) {
      if (!inView || document.hidden) return;
      const pt = locate(event);
      const near = pt.x > -40 && pt.x < width + 40 && pt.y > -40 && pt.y < height + 40;
      if (!near) {
        if (hasPointer) reset();
        return;
      }

      if (!pointer.initialized) {
        pointer.x = pt.x;
        pointer.y = pt.y;
        pointer.initialized = true;
      }

      pointer.targetX = pt.x;
      pointer.targetY = pt.y;
      hasPointer = true;
      wake();
    }

    function handlePointerLeave() {
      reset();
    }

    function resize() {
      width = Math.max(1, container!.offsetWidth);
      height = Math.max(1, container!.offsetHeight);
      surface!.setAttribute("viewBox", `0 0 ${width + PADDING * 2} ${height + PADDING * 2}`);
      draw();
      wake();
    }

    const size = new ResizeObserver(resize);
    size.observe(container);
    resize();

    const intersection = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) wake();
    });
    intersection.observe(container);

    container.addEventListener("pointermove", handlePointerMove, { passive: true });
    container.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    draw();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      size.disconnect();
      intersection.disconnect();
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [amount, rTL, rTR, rBR, rBL]);

  return (
    <div
      ref={containerRef}
      className={`relative isolate max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed transition-colors duration-200 cursor-default select-text ${
        isUser ? "rounded-tr-xs" : "rounded-tl-xs"
      } ${className}`}
      style={style}
    >
      {/* Living Elastic Background Surface (Clipped directly to the elastic SVG path) */}
      <div
        className={`pointer-events-none absolute -inset-5 z-[5] transition-shadow duration-300 ${
          isUser
            ? "bg-gradient-to-br from-[#0070ba] via-[#005ea6] to-[#00457c] text-white backdrop-blur-md shadow-[0_4px_14px_rgba(0,112,186,0.22),inset_0_1px_1px_rgba(255,255,255,0.28)]"
            : isDark
            ? "bg-[#131b2b]/88 backdrop-blur-xl border border-slate-700/60 shadow-[0_4px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-[0_4px_14px_rgba(15,23,42,0.05),inset_0_1px_1px_rgba(255,255,255,0.9)]"
        }`}
        style={{
          clipPath: `url(#${clipId})`,
          WebkitClipPath: `url(#${clipId})`,
        }}
        aria-hidden="true"
      />

      {/* Living SVG Meniscus Outline & Specular Highlight */}
      <svg
        ref={svgRef}
        className="pointer-events-none absolute select-none z-[20] overflow-visible"
        style={{
          width: `calc(100% + ${PADDING * 2}px)`,
          height: `calc(100% + ${PADDING * 2}px)`,
          inset: `-${PADDING}px`,
        }}
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path ref={clipRef} />
          </clipPath>
        </defs>

        {/* Outer living rim glow */}
        <path
          ref={rimGlowRef}
          fill="none"
          stroke={
            isUser
              ? isDark
                ? "rgba(56, 189, 248, 0.38)"
                : "rgba(0, 112, 186, 0.4)"
              : isDark
              ? "rgba(56, 189, 248, 0.22)"
              : "rgba(0, 112, 186, 0.24)"
          }
          strokeWidth={isUser ? "2px" : "1.8px"}
          vectorEffect="non-scaling-stroke"
          style={{
            filter: isUser
              ? "drop-shadow(0 0 4px rgba(0, 112, 186, 0.35))"
              : isDark
              ? "drop-shadow(0 0 4px rgba(0, 112, 186, 0.2))"
              : "drop-shadow(0 0 3px rgba(0, 112, 186, 0.16))",
          }}
        />

        {/* Inner specular meniscus crest */}
        <path
          ref={rimRef}
          fill="none"
          stroke={
            isUser
              ? isDark
                ? "rgba(255, 255, 255, 0.35)"
                : "rgba(255, 255, 255, 0.65)"
              : isDark
              ? "rgba(148, 163, 184, 0.24)"
              : "rgba(255, 255, 255, 0.85)"
          }
          strokeWidth="1.1px"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Interactive Content */}
      <div className="relative z-[15] h-full w-full">{children}</div>
    </div>
  );
};

export default ElasticChatBubble;
