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
  /** Grid spacing in CSS pixels. */
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

const POINTER_RADIUS = 220;
const SPRING_K = 18;
const DAMPING = 0.82;
const LINK_DISTANCE = 75;
const RING_DISTANCE = 90;
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
  spacing = 55,
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
    let lastTime = performance.now();
    let visible = true;

    const initNodes = () => {
      cols = Math.ceil(width / spacing) + 1;
      rows = Math.ceil(height / spacing) + 1;
      nodes = [];
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes();
      if (reduceMotion.matches) draw(0);
    };

    const step = (dt: number) => {
      const vx = (pointer.x - pointer.prevX) / (dt * 1000 || 1);
      const vy = (pointer.y - pointer.prevY) / (dt * 1000 || 1);
      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
      const speed = Math.min(Math.hypot(vx, vy), 20);

      for (const n of nodes) {
        n.pulse += dt * 3;
        const dx = pointer.x - n.x;
        const dy = pointer.y - n.y;
        const dist = Math.hypot(dx, dy);
        // Faster sweeps push harder (a kinetic shockwave), capped so a jump of the pointer does not explode the grid.
        if (dist < POINTER_RADIUS && dist > 0) {
          const force = (1 - dist / POINTER_RADIUS) * (1500 + speed * 150);
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

      ctx.lineWidth = 0.7;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const n = nodes[i * rows + j];
          for (const [di, dj] of NEIGHBOURS) {
            const ni = i + di;
            const nj = j + dj;
            if (ni >= cols || nj < 0 || nj >= rows) continue;
            const m = nodes[ni * rows + nj];
            const d = Math.hypot(n.x - m.x, n.y - m.y);
            if (d >= LINK_DISTANCE) continue;
            ctx.strokeStyle = `rgba(${nodeColor}, ${(1 - d / LINK_DISTANCE) * 0.18})`;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }
      }

      ctx.font = "8px ui-monospace, SFMono-Regular, Consolas, monospace";
      for (const n of nodes) {
        const dist = Math.hypot(pointer.x - n.x, pointer.y - n.y);
        const near = dist < POINTER_RADIUS;
        const pulse = time === 0 ? 0 : Math.sin(n.pulse);
        ctx.fillStyle = near
          ? `rgba(${accentColor}, 0.95)`
          : `rgba(${nodeColor}, ${0.25 + pulse * 0.1})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(0.5, near ? n.radius * 2.2 : n.radius + pulse * 0.3), 0, Math.PI * 2);
        ctx.fill();

        if (dist < RING_DISTANCE) {
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

    const loop = (now: number) => {
      frameId = 0;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      step(dt);
      draw(now);
      schedule();
    };

    const schedule = () => {
      if (frameId || !visible || document.hidden || reduceMotion.matches) return;
      lastTime = performance.now();
      frameId = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduceMotion.matches) return;
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
