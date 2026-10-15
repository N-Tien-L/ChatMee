"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Inertial page scrolling for the public landing (Lenis, D-15). Native scrolling stays in charge for keyboard, the scroll
 * bar and touch; nothing runs under reduced motion. In-page anchor links glide to their section.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.1, anchors: true });
    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);
  return null;
}
