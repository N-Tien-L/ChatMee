"use client";

import RotatingText from "@/components/fx/rotating-text";
import { usePrefersReducedMotion } from "@/components/fx/use-prefers-reduced-motion";

const AUDIENCES = ["team", "study group", "squad", "friends", "club"];

/** Hero headline: the audience word rotates (React Bits RotatingText); screen readers get one stable sentence. */
export function HeroHeadline() {
  const reduced = usePrefersReducedMotion();
  return (
    <h1 className="font-display text-[44px] font-bold leading-[0.98] tracking-[-0.04em] sm:text-[68px] lg:text-[80px]">
      <span className="sr-only">Chat with your people and know every message landed.</span>
      <span aria-hidden="true" className="block">
        Chat with your
        <RotatingText
          texts={AUDIENCES}
          auto={!reduced}
          rotationInterval={2400}
          staggerDuration={0.02}
          staggerFrom="last"
          splitBy="characters"
          mainClassName="ml-3 inline-flex overflow-hidden rounded-2xl bg-primary px-3 pb-1 text-primary-foreground align-baseline sm:ml-4 sm:px-4"
          splitLevelClassName="overflow-hidden"
        />
      </span>
      <span aria-hidden="true" className="mt-2 block">
        and know it{" "}
        <span className="relative inline-block bg-gradient-to-r from-[#ff6a3d] to-[#ffb38a] bg-clip-text text-transparent">
          landed.
        </span>
      </span>
    </h1>
  );
}
