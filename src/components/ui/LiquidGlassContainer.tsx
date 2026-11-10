"use client";

import React, {
  useEffect,
  useId,
  useRef,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

export interface LiquidGlassSettings {
  blur?: number; // 0..40
  opacity?: number; // 0.04..0.95
  saturation?: number; // 0.5..2.5
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
  borderRadius?: number; // default: 28px
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

      const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 28, w / 2, h / 2);
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
  elasticEdges = true,
  intensity = 0.9,
  rippleStrength = 1,
  showCursor = true,
  cursorSize = 36,
}: {
  containerRef: RefObject<HTMLElement | null>;
  clipId: string;
  elasticEdges?: boolean;
  intensity?: number;
  rippleStrength?: number;
  showCursor?: boolean;
  cursorSize?: number;
}) {
  const diameter = clamp(cursorSize, 24, 56, 36);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipRef = useRef<SVGPathElement>(null);
  const rimGlowRef = useRef<SVGPathElement>(null);
  const rimRef = useRef<SVGPathElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const rippleLayerRef = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const surface = svgRef.current;
    const outline = rimRef.current;
    const outlineGlow = rimGlowRef.current;
    const clipping = clipRef.current;
    const lens = cursorRef.current;

    if (!container || !surface || !outline || !outlineGlow || !clipping || !lens) return;

    const amount = elasticEdges ? clamp(intensity, 0, 1.5, 0.9) : 0;
    const strength = clamp(rippleStrength, 0, 1.5, 1);

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

    // Resting position on left rim (similar to reference wordmark card)
    const pointer = {
      x: 0,
      y: 120,
      targetX: 0,
      targetY: 120,
      visible: 1,
      targetVisible: 1,
      initialized: true,
    };

    let width = Math.max(1, container.offsetWidth);
    let height = Math.max(1, container.offsetHeight);
    let radius = Math.min(parseFloat(getComputedStyle(container).borderTopLeftRadius) || 28, width / 2, height / 2);
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

      // Top edge
      curve(
        (t) => {
          const x = radius + t * (width - 2 * radius);
          return { x, y: -bend(x, width, edges[0]) };
        },
        width - 2 * radius
      );
      d += " Q" + p({ x: width, y: 0 }) + " " + p({ x: width, y: radius });

      // Right edge
      curve(
        (t) => {
          const y = radius + t * (height - 2 * radius);
          return { x: width + bend(y, height, edges[1]), y };
        },
        height - 2 * radius
      );
      d += " Q" + p({ x: width, y: height }) + " " + p({ x: width - radius, y: height });

      // Bottom edge
      curve(
        (t) => {
          const x = width - radius - t * (width - 2 * radius);
          return { x, y: height + bend(x, width, edges[2]) };
        },
        width - 2 * radius
      );
      d += " Q" + p({ x: 0, y: height }) + " " + p({ x: 0, y: height - radius });

      // Left edge
      curve(
        (t) => {
          const y = height - radius - t * (height - 2 * radius);
          return { x: -bend(y, height, edges[3]), y };
        },
        height - 2 * radius
      );
      d += " Q" + p({ x: 0, y: 0 }) + " " + p({ x: radius, y: 0 }) + " Z";

      outline!.setAttribute("d", d);
      outlineGlow!.setAttribute("d", d);
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
        if (hasPointer && at > radius && at < length - radius && Math.abs(out) < 85) {
          edge.center = at;
          const proximity = smoothstep(1 - Math.abs(out) / 85);
          edge.target = Math.max(-14, Math.min(24, 14 + out * 0.85)) * proximity * amount;
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
      if (strength === 0 || !inView || document.hidden || event.button !== 0 || !event.isPrimary) return;
      const point = locate(event);
      if (point.x < 0 || point.x > width || point.y < 0 || point.y > height || !waves.length) return;
      const slot = nextWave++ % waves.length;
      waves[slot] = { ...point, age: 0, reach: Math.max(120, Math.min(320, width * 0.4)) };
      rippleNodes[slot].setAttribute("transform", `translate(${point.x + PADDING} ${point.y + PADDING})`);
      rippleNodes[slot].style.opacity = "0";
      wake();
    }

    function drawRipples(dt: number) {
      waves.forEach((wave, i) => {
        if (!wave) return;
        wave.age += dt;
        const progress = Math.min(1, wave.age / 1.3);
        const r = 18 + wave.reach * (1 - (1 - progress) ** 2);
        const fadeIn = smoothstep(wave.age / 0.08);
        rippleNodes[i].style.opacity = String(Math.min(1, strength * 0.85 * fadeIn * (1 - progress) ** 1.3));
        rippleCircles[i].forEach((circle) => circle.setAttribute("r", String(round(r))));
        if (progress === 1) {
          waves[i] = null;
          rippleNodes[i].style.opacity = "0";
        }
      });
    }

    function tick(now: number) {
      raf = 0;
      if (disposed || !inView || document.hidden) {
        last = 0;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - (last || now - 16.67)) / 1000));
      last = now;

      const follow = 1 - Math.exp(-20 * dt);
      const fade = 1 - Math.exp(-14 * dt);
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;
      pointer.visible += (pointer.targetVisible - pointer.visible) * fade;

      // Update surface light caustic reflection
      container!.style.setProperty("--mouse-x", `${round(pointer.x)}px`);
      container!.style.setProperty("--mouse-y", `${round(pointer.y)}px`);

      targets();

      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / steps;
      for (let step = 0; step < steps; step++) {
        for (const edge of edges) {
          edge.velocity += (-280 * (edge.value - edge.target) - 20 * edge.velocity) * h;
          edge.value += edge.velocity * h;
          if (Math.abs(edge.value) > 30) {
            edge.value = Math.sign(edge.value) * 30;
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
      if (inView && !document.hidden && !disposed && !raf) {
        raf = requestAnimationFrame(tick);
      }
    }

    function reset() {
      hasPointer = false;
      contact = null;
      // Gently return lens to left rim bead resting position
      pointer.targetX = 0;
      pointer.targetY = 120;
      pointer.targetVisible = 0.95;
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

    function update(event: PointerEvent) {
      if (!inView || document.hidden) return;
      const pt = locate(event);
      const near = pt.x > -80 && pt.x < width + 80 && pt.y > -80 && pt.y < height + 80;
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
      pointer.targetVisible = showCursor ? 1 : 0;
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
        reset();
        return;
      }
      if (event.pointerId === contact) reset();
    }

    function resize() {
      width = Math.max(1, container!.offsetWidth);
      height = Math.max(1, container!.offsetHeight);
      radius = Math.min(parseFloat(getComputedStyle(container!).borderTopLeftRadius) || 28, width / 2, height / 2);
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

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });

    // Initial draw & wake to ensure resting droplet is immediately visible
    draw();
    wake();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      size.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      clearRipples();
    };
  }, [containerRef, elasticEdges, intensity, rippleStrength, diameter, showCursor]);

  return (
    <>
      {/* Living SVG Meniscus Outline & Refractive Ripples */}
      <svg
        ref={svgRef}
        className="g-liquid-rim pointer-events-none absolute select-none z-25 overflow-visible"
        style={{
          width: "calc(100% + 64px)",
          height: "calc(100% + 64px)",
          inset: "-32px",
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

        {/* Expanding click ripples with specular crest and caustic ring */}
        <g ref={rippleLayerRef} clipPath={`url(#${clipId})`}>
          {[0, 1, 2, 3].map((index) => (
            <g key={index} className="g-liquid-ripple" opacity="0">
              <circle stroke="rgba(245, 158, 11, 0.45)" strokeWidth="2.4" fill="none" cy="1.2" r="0" />
              <circle stroke="rgba(255, 255, 255, 0.95)" strokeWidth="1.5" fill="none" r="0" />
            </g>
          ))}
        </g>

        {/* Outer amber caustic edge glow */}
        <path
          ref={rimGlowRef}
          fill="none"
          stroke="rgba(245, 158, 11, 0.45)"
          strokeWidth="2.5px"
          vectorEffect="non-scaling-stroke"
          style={{
            filter: "drop-shadow(0 0 6px rgba(245, 158, 11, 0.35))",
          }}
        />

        {/* Inner crisp specular meniscus highlight */}
        <path
          ref={rimRef}
          fill="none"
          stroke="rgba(255, 255, 255, 0.95)"
          strokeWidth="1.4px"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Living Glass Lens Droplet (3D spherical refraction bead) */}
      <div
        ref={cursorRef}
        className="g-liquid-lens pointer-events-none absolute select-none z-30 rounded-full transition-opacity duration-200"
        style={{
          width: diameter,
          height: diameter,
          inset: "0 auto auto 0",
          background:
            "radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.6) 28%, rgba(245, 158, 11, 0.28) 55%, rgba(255, 255, 255, 0.2) 100%)",
          border: "1.5px solid rgba(255, 255, 255, 0.95)",
          boxShadow:
            "inset 0 2px 4px #ffffff, inset 0 -2px 4px rgba(217, 119, 6, 0.25), 0 8px 24px -4px rgba(180, 120, 30, 0.35), 0 0 12px rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(4px) saturate(1.8)",
          WebkitBackdropFilter: "blur(4px) saturate(1.8)",
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
  intensity = 0.9,
  rippleStrength = 1,
  showCursor = true,
  cursorSize = 36,
  borderRadius = 28,
  contentClassName = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const clipId = "liquid-glass-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

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
      className={`relative isolate overflow-visible ${className}`}
      style={{
        ...dynamicGlassStyle,
        borderRadius,
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(253, 251, 247, 0.45) 100%)",
        border: "1.5px solid rgba(255, 255, 255, 0.85)",
        boxShadow:
          "0 20px 48px -12px rgba(24, 24, 27, 0.08), 0 0 32px rgba(245, 158, 11, 0.06), inset 0 1px 2px rgba(255, 255, 255, 0.95), inset 0 -2px 6px rgba(217, 119, 6, 0.04)",
        backdropFilter: "blur(20px) saturate(1.8)",
        WebkitBackdropFilter: "blur(20px) saturate(1.8)",
      }}
    >
      {/* Dynamic Cursor Light Sheen (Caustic Reflection that slides with pointer) */}
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{
          borderRadius,
          background:
            "radial-gradient(circle 380px at var(--mouse-x, 0px) var(--mouse-y, 120px), rgba(255, 255, 255, 0.5) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Liquid Refraction Backdrop Surface (Overscan 32px to capture outward meniscus stretching) */}
      <div
        className="g-liquid-material pointer-events-none absolute -inset-8 transition-shadow duration-300 z-5"
        style={{
          background: `linear-gradient(145deg, rgba(255, 255, 255, 0.35), transparent 36%, rgba(255, 255, 255, 0.05) 67%, rgba(255, 255, 255, 0.18)), color-mix(in srgb, ${tint} calc(${opacity} * 100%), transparent)`,
          backdropFilter: `blur(var(--glass-blur)) saturate(var(--glass-saturation)) var(--glass-refraction, blur(0px))`,
          WebkitBackdropFilter: `blur(var(--glass-blur)) saturate(var(--glass-saturation))`,
          clipPath: `url(#${clipId})`,
        }}
        aria-hidden="true"
      />

      {/* Living Elastic Rim & Cursor Ripple Motion */}
      {motion && (
        <LiquidGlassMotion
          containerRef={containerRef}
          clipId={clipId}
          elasticEdges={elasticEdges}
          intensity={intensity}
          rippleStrength={rippleStrength}
          showCursor={showCursor}
          cursorSize={cursorSize}
        />
      )}

      {/* Content Wrapper */}
      <div className={`relative z-20 h-full w-full ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
};

export default LiquidGlassContainer;
