"use client";

import { useEffect, useRef } from "react";

/**
 * Constellation grid: a spring-mass mesh of nodes that the pointer pushes away, with radar rings and hex readouts near
 * the cursor. Adapted from an owner-supplied snippet (CM-084, see components/PROVENANCE.md).
 *
 * Changes from the snippet: sized to its container (not the window), transparent so the page's glow shows through,
 * links only between grid neighbours (no all-pairs scan), ChatMee palette, pauses off screen and in background tabs,
 * and under reduced motion draws one still frame with no pointer response.
 */

interface ConstellationGridProps {
  /** Resting node colour, "r, g, b". */
  nodeColor?: string;
  /** Colour of nodes near the pointer, "r, g, b". */
  accentColor?: string;
  /** Colour of the radar rings, "r, g, b". */
  ringColor?: string;
  /** Fixed grid spacing in CSS pixels. Omit to size cells from the container width (about 26 columns, 36 to 64 px). */
  spacing?: number;
  className?: string;
}

interface GridNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  radius: number;
  label: string;
  pulse: number;
}

const SPRING_K = 18;
const DAMPING = 0.82;
/** Responsive cell size: width / COLUMNS, clamped. Every distance below scales with the cell so the mesh keeps its look. */
const COLUMNS = 26;
const MIN_CELL = 36;
const MAX_CELL = 64;
/** Ratios to the cell size, from the original 55 px tuning (pointer 220, links 75, rings 90). */
const POINTER_RATIO = 4;
const LINK_RATIO = 1.36;
const RING_RATIO = 1.64;
/** Adaptive quality: average frame interval (ms) above which the mesh is degraded, and how much coarser a degraded cell is. */
const SLOW_FRAME_MS = 28;
const DEGRADED_CELL_SCALE = 1.6;
/** Radians per millisecond of the virtual pointer on touch devices (a full horizontal sweep takes about 16 s). */
const AMBIENT_SPEED = 0.0004;
/** Number of alpha levels links are quantised to so they can be stroked in batches. */
const LINK_ALPHA_STEPS = 12;
/** Neighbour offsets (in grid cells) checked for links: right, down and both diagonals; each pair is visited once. */
const NEIGHBOURS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export default function ConstellationGrid({
  nodeColor = "234, 245, 242",
  accentColor = "46, 230, 193",
  ringColor = "255, 106, 61",
  spacing,
  className = "",
}: ConstellationGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: -1000, y: -1000, prevX: -1000, prevY: -1000 };
    let nodes: GridNode[] = [];
    let cols = 0;
    let rows = 0;
    let width = 0;
    let height = 0;
    let bounds = canvas.getBoundingClientRect();
    let frameId = 0;
    let cell = 55;
    let pointerRadius = cell * POINTER_RATIO;
    let linkDistance = cell * LINK_RATIO;
    let ringDistance = cell * RING_RATIO;
    let lastTime = performance.now();
    let visible = true;
    /**
     * Adaptive quality for browsers without canvas acceleration (software rendering). 0 = full, 1 = coarser mesh at 1x
     * pixel density, 2 = frozen still frame. Escalates when frames stay slow; never goes back down in a session.
     */
    let degrade = 0;
    let frozen = false;
    let prevFrameAt = 0;
    let slowEma = 16;
    let framesSinceChange = 0;

    const initNodes = () => {
      cell = spacing ?? Math.min(MAX_CELL, Math.max(MIN_CELL, Math.round(width / COLUMNS)));
      if (degrade >= 1) cell = Math.round(cell * DEGRADED_CELL_SCALE);
      pointerRadius = cell * POINTER_RATIO;
      linkDistance = cell * LINK_RATIO;
      ringDistance = cell * RING_RATIO;
      cols = Math.ceil(width / cell) + 1;
      rows = Math.ceil(height / cell) + 1;
      nodes = [];
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * cell;
          const y = j * cell;
          nodes.push({
            x,
            y,
            vx: 0,
            vy: 0,
            baseX: x,
            baseY: y,
            radius: Math.random() * 1.2 + 1.2,
            label: `${(i * 7).toString(16).toUpperCase()}:${(j * 11).toString(16).toUpperCase()}`,
            pulse: Math.random() * Math.PI * 2,
          });
        }
      }
    };

    const resize = () => {
      const dpr = degrade >= 1 ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes();
      if (reduceMotion.matches) draw(0);
    };

    /**
     * The spring is integrated with explicit Euler, which is only stable for small steps. Running it with the real frame
     * time made a slow frame (dt up to 50 ms) blow the mesh up, so the grid jittered wildly exactly when the browser was
     * struggling. It now advances in fixed 1/60 s steps (at most MAX_SUBSTEPS per frame): identical at 60 fps, slower
     * but stable when frames drop.
     */
    const FIXED_STEP = 1 / 60;
    const MAX_SUBSTEPS = 3;
    let accumulator = 0;

    const step = (frameDt: number) => {
      const vx = (pointer.x - pointer.prevX) / (frameDt * 1000 || 1);
      const vy = (pointer.y - pointer.prevY) / (frameDt * 1000 || 1);
      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
      const speed = Math.min(Math.hypot(vx, vy), 20);

      accumulator = Math.min(accumulator + frameDt, FIXED_STEP * MAX_SUBSTEPS);
      while (accumulator >= FIXED_STEP) {
        integrate(FIXED_STEP, speed);
        accumulator -= FIXED_STEP;
      }
    };

    const integrate = (dt: number, speed: number) => {
      for (const n of nodes) {
        n.pulse += dt * 3;
        const dx = pointer.x - n.x;
        const dy = pointer.y - n.y;
        const dist = Math.hypot(dx, dy);
        // Faster sweeps push harder (a kinetic shockwave), capped so a jump of the pointer does not explode the grid.
        if (dist < pointerRadius && dist > 0) {
          const force = (1 - dist / pointerRadius) * (1500 + speed * 150);
          n.vx -= (dx / dist) * force * dt;
          n.vy -= (dy / dist) * force * dt;
        }
        n.vx += (n.baseX - n.x) * SPRING_K * dt;
        n.vy += (n.baseY - n.y) * SPRING_K * dt;
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx * dt * 60;
        n.y += n.vy * dt * 60;
      }
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Links are batched into a few alpha buckets: one path and one stroke per bucket instead of one per link.
      ctx.lineWidth = 0.7;
      const buckets: Path2D[] = Array.from({ length: LINK_ALPHA_STEPS }, () => new Path2D());
      const used: boolean[] = new Array(LINK_ALPHA_STEPS).fill(false);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const n = nodes[i * rows + j];
          for (const [di, dj] of NEIGHBOURS) {
            const ni = i + di;
            const nj = j + dj;
            if (ni >= cols || nj < 0 || nj >= rows) continue;
            const m = nodes[ni * rows + nj];
            const d = Math.hypot(n.x - m.x, n.y - m.y);
            if (d >= linkDistance) continue;
            const bucket = Math.min(LINK_ALPHA_STEPS - 1, Math.floor((1 - d / linkDistance) * LINK_ALPHA_STEPS));
            buckets[bucket].moveTo(n.x, n.y);
            buckets[bucket].lineTo(m.x, m.y);
            used[bucket] = true;
          }
        }
      }
      for (let b = 0; b < LINK_ALPHA_STEPS; b++) {
        if (!used[b]) continue;
        ctx.strokeStyle = `rgba(${nodeColor}, ${((b + 0.5) / LINK_ALPHA_STEPS) * 0.18})`;
        ctx.stroke(buckets[b]);
      }

      ctx.font = "8px ui-monospace, SFMono-Regular, Consolas, monospace";
      for (const n of nodes) {
        const dist = Math.hypot(pointer.x - n.x, pointer.y - n.y);
        const near = dist < pointerRadius;
        const pulse = time === 0 ? 0 : Math.sin(n.pulse);
        ctx.fillStyle = near
          ? `rgba(${accentColor}, 0.95)`
          : `rgba(${nodeColor}, ${0.25 + pulse * 0.1})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(0.5, near ? n.radius * 2.2 : n.radius + pulse * 0.3), 0, Math.PI * 2);
        ctx.fill();

        if (dist < ringDistance) {
          const ring = ((n.pulse * 20) % 30) + 4;
          ctx.strokeStyle = `rgba(${ringColor}, ${(1 - ring / 34) * 0.45})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(n.x, n.y, ring, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `rgba(${accentColor}, 0.85)`;
          ctx.fillText(n.label, n.x + 10, n.y - 10);
          ctx.lineWidth = 0.7;
        }
      }
    };

    /**
     * Touch devices have no hover, so the mesh would sit still. There a virtual pointer drifts along a slow looping
     * path and drives the same push, rings and readouts. Real touches are ignored (they are scrolls, not hovers).
     */
    const ambient = window.matchMedia("(hover: none)");
    const driftPointer = (now: number) => {
      pointer.x = width * (0.5 + 0.38 * Math.sin(now * AMBIENT_SPEED));
      pointer.y = height * (0.45 + 0.3 * Math.sin(now * AMBIENT_SPEED * 0.73 + 1.3));
      if (pointer.prevX === -1000) {
        pointer.prevX = pointer.x;
        pointer.prevY = pointer.y;
      }
    };

    const loop = (now: number) => {
      frameId = 0;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      if (ambient.matches) driftPointer(now);
      step(dt);
      draw(now);
      watchFrameTime(now);
      schedule(false);
    };

    /** Escalates quality degradation when the real frame interval stays well above 60 fps for about a second. */
    const watchFrameTime = (now: number) => {
      const interval = prevFrameAt ? now - prevFrameAt : 16;
      prevFrameAt = now;
      slowEma = slowEma * 0.9 + Math.min(interval, 200) * 0.1;
      framesSinceChange += 1;
      if (framesSinceChange < 45 || slowEma < SLOW_FRAME_MS || degrade >= 2) return;
      degrade += 1;
      framesSinceChange = 0;
      slowEma = 16;
      prevFrameAt = 0;
      onPointerLeave();
      if (degrade >= 2) {
        frozen = true;
        stop();
      }
      resize();
      if (frozen) draw(0);
    };

    /**
     * Queues the next frame. The loop passes resume=false so the frame watcher keeps measuring the real interval.
     * Every other caller starts the loop after a pause (first start, back on screen or in the foreground, reduced motion
     * turned off), so the clocks restart there and the pause gap is never counted as a slow frame.
     */
    const schedule = (resume = true) => {
      if (frameId || frozen || !visible || document.hidden || reduceMotion.matches) return;
      if (resume) {
        prevFrameAt = 0;
        lastTime = performance.now();
      }
      frameId = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduceMotion.matches || ambient.matches) return;
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
    };
    const onPointerLeave = () => {
      pointer.x = pointer.y = pointer.prevX = pointer.prevY = -1000;
    };
    const onScroll = () => {
      bounds = canvas.getBoundingClientRect();
    };
    const onVisibility = () => (document.hidden ? stop() : schedule());
    const onMotionChange = () => {
      onPointerLeave();
      if (reduceMotion.matches) {
        stop();
        initNodes();
        draw(0);
      } else {
        schedule();
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) schedule();
      else stop();
    });
    visibility.observe(canvas);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    reduceMotion.addEventListener("change", onMotionChange);

    resize();
    schedule();

    return () => {
      stop();
      resizeObserver.disconnect();
      visibility.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotion.removeEventListener("change", onMotionChange);
    };
  }, [nodeColor, accentColor, ringColor, spacing]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none block h-full w-full ${className}`} />;
}
