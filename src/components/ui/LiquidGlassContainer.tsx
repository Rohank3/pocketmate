"use client";

import React, {
  useEffect,
  useId,
  useRef,
  useState,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

export interface LiquidGlassSettings {
  blur?: number; // 0..40
  opacity?: number; // 0.04..0.95
  saturation?: number; // 0.5..2
  tint?: string; // hex color or css color variable
  edge?: number; // 0..1
  distortion?: number; // 0..60
}

export interface LiquidGlassContainerProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  glass?: LiquidGlassSettings;
  accent?: string;
  motion?: boolean;
  elasticEdges?: boolean;
  intensity?: number; // edge spring intensity: 0..1.5
  rippleStrength?: number; // click ripple intensity: 0..1.5
  showCursor?: boolean; // pointer lens follower
  cursorSize?: number; // 18..56
  borderRadius?: number; // default: 24px
  contentClassName?: string;
}

const defaultGlassSettings: Required<LiquidGlassSettings> = {
  blur: 20,
  opacity: 0.85,
  saturation: 1.8,
  tint: "#fdfbf7",
  edge: 0.85,
  distortion: 28,
};

const clamp = (val: number | undefined, min: number, max: number, fallback: number) => {
  if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
};

const smoothstep = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

const PADDING = 32;
const CONTROL_SELECTOR = "a, button, input, textarea, select, [contenteditable], .ag-root, .ag-cell, .ag-header-cell";

/**
 * Chromium-only SVG FeDisplacementMap generator via 2D Canvas Normal Mapping.
 * Gracefully transparent on Safari / Firefox which continue to use pure CSS backdrop-filter.
 */
function useLiquidOptics(scope: RefObject<HTMLDivElement | null>) {
  const key = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    const root = scope.current;
    if (!root) return;

    const supportsSVGBackdrop =
      typeof navigator !== "undefined" &&
      /Chrome|Chromium|Edg/.test(navigator.userAgent) &&
      !/CriOS/.test(navigator.userAgent);

    if (!supportsSVGBackdrop) return;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.style.pointerEvents = "none";

    const defs = document.createElementNS(ns, "defs");
    svg.append(defs);
    root.append(svg);

    const surfaces = Array.from(
      root.querySelectorAll<HTMLElement>('.g-liquid-material:not([data-glass-optics="elastic"])')
    );

    const sizes = new Map<HTMLElement, string>();
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

    const build = (el: HTMLElement) => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h) return;

      const style = getComputedStyle(el);
      const strength = parseFloat(style.getPropertyValue("--glass-distortion")) || 24;
      const index = surfaces.indexOf(el);
      const id = `liquid-optics-${key}-${index >= 0 ? index : 0}`;

      const signature = `${w}:${h}:${strength}`;
      if (sizes.get(el) === signature) return;
      sizes.set(el, signature);

      defs.querySelector(`[id="${id}"]`)?.remove();

      const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 24, w / 2, h / 2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w * 0.5);
      canvas.height = Math.ceil(h * 0.5);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const pixels = ctx.createImageData(canvas.width, canvas.height);
      const data = pixels.data;

      const rect = (x: number, y: number, hw: number, hh: number, r: number) => {
        const qx = Math.abs(x) - hw + r;
        const qy = Math.abs(y) - hh + r;
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      };

      const distance = (x: number, y: number) => {
        return rect(x - w / 2, y - h / 2, w / 2, h / 2, radius);
      };

      const bevel = Math.min(18, h * 0.25);
      for (let py = 0; py < canvas.height; py++) {
        for (let px = 0; px < canvas.width; px++) {
          const x = ((px + 0.5) * w) / canvas.width;
          const y = ((py + 0.5) * h) / canvas.height;
          const d = distance(x, y);
          const bend = d < 0 ? Math.sin(Math.min(1, -d / bevel) * Math.PI) : 0;
          const nx = (distance(x + 1, y) - distance(x - 1, y)) * 0.5;
          const ny = (distance(x, y + 1) - distance(x, y - 1)) * 0.5;
          const len = Math.hypot(nx, ny) || 1;
          const i = (py * canvas.width + px) * 4;

          data[i] = 128 + (nx / len) * bend * 110;
          data[i + 1] = 128 + (ny / len) * bend * 110;
          data[i + 2] = 128;
          data[i + 3] = 255;
        }
      }

      ctx.putImageData(pixels, 0, 0);

      const filter = document.createElementNS(ns, "filter");
      filter.setAttribute("id", id);
      filter.setAttribute("x", "0");
      filter.setAttribute("y", "0");
      filter.setAttribute("width", "100%");
      filter.setAttribute("height", "100%");
      filter.setAttribute("color-interpolation-filters", "sRGB");

      const map = document.createElementNS(ns, "feImage");
      map.setAttribute("href", canvas.toDataURL());
      map.setAttribute("width", "100%");
      map.setAttribute("height", "100%");
      map.setAttribute("preserveAspectRatio", "none");
      map.setAttribute("result", "lens");

      const displacement = document.createElementNS(ns, "feDisplacementMap");
      displacement.setAttribute("in", "SourceGraphic");
      displacement.setAttribute("in2", "lens");
      displacement.setAttribute("scale", String(strength));
      displacement.setAttribute("xChannelSelector", "R");
      displacement.setAttribute("yChannelSelector", "G");

      filter.append(map, displacement);
      defs.append(filter);

      el.style.setProperty("--glass-refraction", `url(#${id})`);
    };

    const queue = (el: HTMLElement) => {
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => build(el), 70));
    };

    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => queue(entry.target as HTMLElement));
    });

    surfaces.forEach((el) => {
      build(el);
      resizeObserver.observe(el);
    });

    return () => {
      resizeObserver.disconnect();
      timers.forEach(clearTimeout);
      svg.remove();
      surfaces.forEach((el) => el.style.removeProperty("--glass-refraction"));
    };
  }, [scope, key]);
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

interface Ripple extends Point {
  age: number;
  reach: number;
}

/**
 * Living Elastic Meniscus & Dynamic Physics Engine.
 */
function LiquidGlassMotion({
  containerRef,
  clipId,
  reduced,
  elasticEdges = true,
  intensity = 0.85,
  rippleStrength = 1,
  showCursor = true,
  cursorSize = 32,
}: {
  containerRef: RefObject<HTMLElement | null>;
  clipId: string;
  reduced: boolean;
  elasticEdges?: boolean;
  intensity?: number;
  rippleStrength?: number;
  showCursor?: boolean;
  cursorSize?: number;
}) {
  const diameter = clamp(cursorSize, 18, 56, 32);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipRef = useRef<SVGPathElement>(null);
  const rimRef = useRef<SVGPathElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const rippleLayerRef = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const surface = svgRef.current;
    const outline = rimRef.current;
    const clipping = clipRef.current;
    const lens = cursorRef.current;

    if (!container || !surface || !outline || !clipping || !lens) return;

    const amount = elasticEdges && !reduced ? clamp(intensity, 0, 1.5, 0.85) : 0;
    const strength = !reduced ? clamp(rippleStrength, 0, 1.5, 1) : 0;
    const enabled = !reduced;

    const rippleNodes = Array.from(
      rippleLayerRef.current?.querySelectorAll<SVGGElement>(".g-liquid-ripple") ?? []
    );
    const rippleCircles = rippleNodes.map((node) => Array.from(node.querySelectorAll("circle")));
    const waves: (Ripple | null)[] = rippleNodes.map(() => null);
    let nextWave = 0;

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
      visible: 0,
      targetVisible: 0,
      initialized: false,
    };

    let width = 1;
    let height = 1;
    let radius = 24;
    let raf = 0;
    let last = 0;
    let inView = true;
    let contact: number | null = null;
    let hasPointer = false;
    let disposed = false;

    const round = (n: number) => Number(n.toFixed(3));
    const p = (pt: Point) => `${round(pt.x + PADDING)} ${round(pt.y + PADDING)}`;

    function bend(at: number, length: number, edge: Edge) {
      if (amount <= 0) return 0;
      const taper = smoothstep((at - radius) / 26) * smoothstep((length - radius - at) / 26);
      return edge.value * Math.exp(-((at - edge.center) ** 2) / (2 * 55 * 55)) * taper;
    }

    function draw() {
      let d = "M" + p({ x: radius, y: 0 });

      function curve(point: (t: number) => Point, length: number) {
        const count = Math.max(12, Math.min(90, Math.ceil(length / 12)));
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

      curve(
        (t) => {
          const x = radius + t * (width - 2 * radius);
          return { x, y: -bend(x, width, edges[0]) };
        },
        width - 2 * radius
      );
      d += " Q" + p({ x: width, y: 0 }) + " " + p({ x: width, y: radius });

      curve(
        (t) => {
          const y = radius + t * (height - 2 * radius);
          return { x: width + bend(y, height, edges[1]), y };
        },
        height - 2 * radius
      );
      d += " Q" + p({ x: width, y: height }) + " " + p({ x: width - radius, y: height });

      curve(
        (t) => {
          const x = width - radius - t * (width - 2 * radius);
          return { x, y: height + bend(x, width, edges[2]) };
        },
        width - 2 * radius
      );
      d += " Q" + p({ x: 0, y: height }) + " " + p({ x: 0, y: height - radius });

      curve(
        (t) => {
          const y = height - radius - t * (height - 2 * radius);
          return { x: -bend(y, height, edges[3]), y };
        },
        height - 2 * radius
      );
      d += " Q" + p({ x: 0, y: 0 }) + " " + p({ x: radius, y: 0 }) + " Z";

      outline!.setAttribute("d", d);
      clipping!.setAttribute("d", d);
    }

    function targets() {
      if (amount <= 0) return;
      const locations = [
        { at: pointer.x, out: -pointer.y, length: width },
        { at: pointer.y, out: pointer.x - width, length: height },
        { at: pointer.x, out: pointer.y - height, length: width },
        { at: pointer.y, out: -pointer.x, length: height },
      ];
      locations.forEach(({ at, out, length }, i) => {
        const edge = edges[i];
        if (hasPointer && at > radius && at < length - radius && Math.abs(out) < 75) {
          edge.center = at;
          const proximity = smoothstep(1 - Math.abs(out) / 75);
          edge.target = Math.max(-12, Math.min(22, 12 + out * 0.8)) * proximity * amount;
        } else {
          edge.target = 0;
        }
      });
    }

    function clearRipples() {
      waves.fill(null);
      rippleNodes.forEach((node) => {
        node.style.opacity = "0";
      });
    }

    function ripple(event: PointerEvent) {
      if (!enabled || strength === 0 || !inView || document.hidden || event.button !== 0 || !event.isPrimary)
        return;
      const point = locate(event);
      if (point.x < 0 || point.x > width || point.y < 0 || point.y > height || !waves.length) return;
      const slot = nextWave++ % waves.length;
      waves[slot] = { ...point, age: 0, reach: Math.max(90, Math.min(260, width * 0.35)) };
      rippleNodes[slot].setAttribute("transform", `translate(${point.x + PADDING} ${point.y + PADDING})`);
      rippleNodes[slot].style.opacity = "0";
      wake();
    }

    function drawRipples(dt: number) {
      waves.forEach((wave, i) => {
        if (!wave) return;
        wave.age += dt;
        const progress = Math.min(1, wave.age / 1.25);
        const r = 18 + wave.reach * (1 - (1 - progress) ** 2);
        const fadeIn = smoothstep(wave.age / 0.09);
        rippleNodes[i].style.opacity = String(Math.min(1, strength * 0.75 * fadeIn * (1 - progress) ** 1.4));
        rippleCircles[i].forEach((circle) => circle.setAttribute("r", String(round(r))));
        if (progress === 1) {
          waves[i] = null;
          rippleNodes[i].style.opacity = "0";
        }
      });
    }

    function tick(now: number) {
      raf = 0;
      if (disposed || !enabled || !inView || document.hidden) {
        last = 0;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - (last || now - 16.67)) / 1000));
      last = now;

      const follow = 1 - Math.exp(-18 * dt);
      const fade = 1 - Math.exp(-16 * dt);
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;
      pointer.visible += (pointer.targetVisible - pointer.visible) * fade;

      targets();

      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / steps;
      for (let step = 0; step < steps; step++) {
        for (const edge of edges) {
          edge.velocity += (-260 * (edge.value - edge.target) - 18 * edge.velocity) * h;
          edge.value += edge.velocity * h;
          if (Math.abs(edge.value) > 29) {
            edge.value = Math.sign(edge.value) * 29;
            edge.velocity = 0;
          }
        }
      }

      draw();
      drawRipples(dt);

      lens!.style.transform = `translate3d(${round(pointer.x - diameter / 2)}px, ${round(
        pointer.y - diameter / 2
      )}px, 0)`;
      lens!.style.opacity = String(round(pointer.visible));

      const unsettled =
        edges.some((e) => Math.abs(e.value - e.target) > 0.015 || Math.abs(e.velocity) > 0.05) ||
        Math.abs(pointer.x - pointer.targetX) + Math.abs(pointer.y - pointer.targetY) > 0.1 ||
        Math.abs(pointer.visible - pointer.targetVisible) > 0.002 ||
        waves.some(Boolean);

      if (unsettled) {
        wake();
      } else {
        edges.forEach((e) => {
          e.value = e.target;
          e.velocity = 0;
        });
        draw();
        pointer.visible = pointer.targetVisible;
        lens!.style.opacity = String(pointer.visible);
        last = 0;
      }
    }

    function wake() {
      if (enabled && inView && !document.hidden && !disposed && !raf) {
        raf = requestAnimationFrame(tick);
      }
    }

    function reset(immediate = false) {
      hasPointer = false;
      contact = null;
      pointer.targetVisible = 0;
      edges.forEach((e) => {
        e.target = 0;
      });
      if (immediate) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
        pointer.visible = 0;
        pointer.initialized = false;
        clearRipples();
        edges.forEach((e) => {
          e.value = 0;
          e.velocity = 0;
        });
        lens!.style.opacity = "0";
        draw();
      } else {
        wake();
      }
    }

    function locate(event: PointerEvent) {
      const bounds = container!.getBoundingClientRect();
      return {
        x: ((event.clientX - bounds.left) * width) / bounds.width,
        y: ((event.clientY - bounds.top) * height) / bounds.height,
      };
    }

    function update(event: PointerEvent) {
      if (!enabled || !inView || document.hidden) return;
      const pt = locate(event);
      const near = pt.x > -75 && pt.x < width + 75 && pt.y > -75 && pt.y < height + 75;
      if (!near) {
        if (hasPointer) reset();
        return;
      }
      const isOverControl =
        event.target instanceof Element && Boolean(event.target.closest(CONTROL_SELECTOR));

      if (!pointer.initialized) {
        pointer.x = pt.x;
        pointer.y = pt.y;
        pointer.initialized = true;
      }
      pointer.targetX = pt.x;
      pointer.targetY = pt.y;

      // Softly adjust pointer lens when over inputs/table cells while keeping the lens bead visibly floating
      pointer.targetVisible = showCursor ? (isOverControl ? 0.45 : 0.95) : 0;
      hasPointer = true;
      wake();
    }

    function move(event: PointerEvent) {
      if (event.pointerType === "touch" && event.pointerId !== contact) return;
      update(event);
    }

    function down(event: PointerEvent) {
      ripple(event);
      if (event.pointerType !== "touch") {
        update(event);
        return;
      }
      const pt = locate(event);
      if (pt.x < -24 || pt.x > width + 24 || pt.y < -24 || pt.y > height + 24) return;
      contact = event.pointerId;
      update(event);
    }

    function release(event: PointerEvent) {
      if (event.type === "pointercancel") {
        reset(true);
        return;
      }
      if (event.pointerId === contact) reset();
    }

    function resize() {
      width = Math.max(1, container!.offsetWidth);
      height = Math.max(1, container!.offsetHeight);
      radius = Math.min(parseFloat(getComputedStyle(container!).borderTopLeftRadius) || 24, width / 2, height / 2);
      surface!.setAttribute("viewBox", `0 0 ${width + PADDING * 2} ${height + PADDING * 2}`);
      reset(true);
    }

    const size = new ResizeObserver(resize);
    size.observe(container);
    resize();

    const intersection = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) reset(true);
    });
    intersection.observe(container);

    if (enabled) {
      window.addEventListener("pointermove", move, { passive: true });
      window.addEventListener("pointerdown", down, { passive: true });
      window.addEventListener("pointerup", release, { passive: true });
      window.addEventListener("pointercancel", release, { passive: true });
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      size.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      lens.style.opacity = "0";
      clearRipples();
    };
  }, [containerRef, reduced, elasticEdges, intensity, rippleStrength, diameter, showCursor]);

  return (
    <>
      <svg
        ref={svgRef}
        className="g-liquid-rim absolute pointer-events-none select-none z-10"
        style={{
          width: "calc(100% + 64px)",
          height: "calc(100% + 64px)",
          inset: "-32px",
          overflow: "visible",
        }}
        viewBox="0 0 1064 664"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path ref={clipRef} />
          </clipPath>
        </defs>
        <g ref={rippleLayerRef} clipPath={`url(#${clipId})`}>
          {[0, 1, 2].map((index) => (
            <g key={index} className="g-liquid-ripple" opacity="0">
              <circle stroke="rgba(217, 119, 6, 0.35)" strokeWidth="1.6" fill="none" cy="1.5" r="0" />
              <circle stroke="rgba(255, 255, 255, 0.95)" strokeWidth="1.2" fill="none" r="0" />
            </g>
          ))}
        </g>
        <path
          ref={rimRef}
          fill="none"
          stroke="rgba(255, 255, 255, 0.9)"
          strokeWidth="1.4px"
          vectorEffect="non-scaling-stroke"
          style={{
            filter: "drop-shadow(0 0 4px rgba(245, 158, 11, 0.25))",
          }}
        />
      </svg>
      <div
        ref={cursorRef}
        className="g-liquid-lens pointer-events-none absolute select-none opacity-0 z-30 rounded-full transition-opacity duration-150"
        style={{
          width: diameter,
          height: diameter,
          inset: "0 auto auto 0",
          background:
            "radial-gradient(ellipse at 28% 20%, rgba(255, 255, 255, 0.75), transparent 40%), radial-gradient(ellipse at 72% 85%, rgba(245, 158, 11, 0.22), transparent 45%)",
          border: "1px solid rgba(255, 255, 255, 0.85)",
          boxShadow:
            "inset 0 1.5px 2px #ffffff, inset 0 -1px 1.5px rgba(24, 24, 27, 0.15), 0 4px 14px rgba(24, 24, 27, 0.12)",
          backdropFilter: "blur(2px) saturate(1.4)",
          WebkitBackdropFilter: "blur(2px) saturate(1.4)",
        }}
        aria-hidden="true"
      />
    </>
  );
}

/**
 * Reusable Production Liquid Glass Container.
 * Provides physical DOM displacement refraction in Chromium + elastic meniscus edge physics + specular ripples.
 */
export const LiquidGlassContainer: React.FC<LiquidGlassContainerProps> = ({
  children,
  className = "",
  style,
  glass = {},
  accent = "#f59e0b",
  motion = true,
  elasticEdges = true,
  intensity = 0.85,
  rippleStrength = 1,
  showCursor = true,
  cursorSize = 32,
  borderRadius = 24,
  contentClassName = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const clipId = "liquid-glass-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useLiquidOptics(containerRef);

  const blur = clamp(glass.blur, 0, 40, defaultGlassSettings.blur);
  const opacity = clamp(glass.opacity, 0.04, 0.98, defaultGlassSettings.opacity);
  const saturation = clamp(glass.saturation, 0.5, 2.5, defaultGlassSettings.saturation);
  const tint = glass.tint || defaultGlassSettings.tint;
  const edge = clamp(glass.edge, 0, 1, defaultGlassSettings.edge);
  const distortion = clamp(glass.distortion, 0, 60, defaultGlassSettings.distortion);

  const dynamicGlassStyle: CSSProperties = {
    "--glass-blur": `${blur}px`,
    "--glass-opacity": opacity,
    "--glass-saturation": saturation,
    "--glass-tint": tint,
    "--glass-edge": edge,
    "--glass-distortion": distortion,
    "--glass-accent": accent,
    ...style,
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`relative isolate ${className}`}
      style={dynamicGlassStyle}
    >
      {/* Liquid Refraction Backdrop Surface */}
      <div
        className="g-liquid-material absolute inset-0 pointer-events-none transition-shadow duration-300"
        style={{
          borderRadius,
          background: `linear-gradient(145deg, rgba(255, 255, 255, 0.35), transparent 36%, rgba(255, 255, 255, 0.05) 67%, rgba(255, 255, 255, 0.18)), color-mix(in srgb, ${tint} calc(${opacity} * 100%), transparent)`,
          backdropFilter: `blur(var(--glass-blur)) saturate(var(--glass-saturation)) var(--glass-refraction, blur(0px))`,
          WebkitBackdropFilter: `blur(var(--glass-blur)) saturate(var(--glass-saturation))`,
          boxShadow: `inset 0 1px 2px rgba(255, 255, 255, calc(${edge} * 0.95)), inset 1px 0 2px rgba(255, 255, 255, calc(${edge} * 0.35)), inset -1px -1px 2px rgba(255, 255, 255, calc(${edge} * 0.55)), inset 0 -4px 8px rgba(13, 18, 15, 0.05), 0 16px 36px -12px rgba(24, 24, 27, 0.08), 0 0 24px rgba(245, 158, 11, 0.05)`,
          clipPath: `url(#${clipId})`,
        }}
        aria-hidden="true"
      />

      {/* Living Elastic Rim & Cursor Ripple Motion */}
      <LiquidGlassMotion
        containerRef={containerRef}
        clipId={clipId}
        reduced={reduced || !motion}
        elasticEdges={elasticEdges}
        intensity={intensity}
        rippleStrength={rippleStrength}
        showCursor={showCursor}
        cursorSize={cursorSize}
      />

      {/* Actual Content Wrapper */}
      <div className={`relative z-20 h-full w-full ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
};

export default LiquidGlassContainer;
