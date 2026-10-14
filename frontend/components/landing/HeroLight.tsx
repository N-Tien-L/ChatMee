"use client";

import dynamic from "next/dynamic";
import { usePrefersReducedMotion } from "@/components/fx/use-prefers-reduced-motion";

const LightRays = dynamic(() => import("@/components/fx/light-rays"), { ssr: false });

interface HeroLightProps {
  /** Ray colour (hex). */
  color?: string;
  className?: string;
}

/**
 * Light falling on a public page from above. A static glow is always painted (server render, no JS, reduced motion);
 * the WebGL rays from React Bits are layered on top only when motion is allowed.
 */
export function HeroLight({ color = "#2ee6c1", className = "" }: HeroLightProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgb(46_230_193/0.22),transparent_70%)]" />
      {!reduced && (
        <LightRays
          raysOrigin="top-center"
          raysColor={color}
          raysSpeed={0.8}
          lightSpread={0.9}
          rayLength={1.6}
          followMouse
          mouseInfluence={0.08}
          noiseAmount={0.06}
          distortion={0.04}
          className="opacity-80"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
