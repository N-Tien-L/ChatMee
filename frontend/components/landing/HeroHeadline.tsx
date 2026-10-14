"use client";

import { LayoutGroup, motion } from "motion/react";
import RotatingText from "@/components/fx/rotating-text";
import { usePrefersReducedMotion } from "@/components/fx/use-prefers-reduced-motion";

const AUDIENCES = ["team", "study group", "squad", "friends", "club"];

/** The pill's width eases with a spring; the letters use a short tween so the gap between two words stays brief. */
const PILL_SPRING = { type: "spring", damping: 30, stiffness: 400 } as const;
const LETTER_TWEEN = { type: "tween", duration: 0.22, ease: "easeOut" } as const;

/**
 * Hero headline: the audience word rotates (React Bits RotatingText) inside a pill that resizes smoothly.
 * The pill sits on its own line with its own leading, so it never covers the line above. Screen readers get one stable sentence.
 */
export function HeroHeadline() {
  const reduced = usePrefersReducedMotion();
  return (
    <h1 className="font-display text-[44px] font-bold leading-[0.98] tracking-[-0.04em] sm:text-[68px] lg:text-[80px]">
      <span className="sr-only">Chat with your people and know every message landed.</span>
      <span aria-hidden="true" className="block">
        Chat with your
      </span>
      <LayoutGroup>
        <span aria-hidden="true" className="mt-3 mb-2 block leading-[1.12] sm:mt-4 sm:mb-3">
          <motion.span
            layout
            transition={PILL_SPRING}
            className="inline-flex overflow-hidden rounded-2xl bg-primary px-3 pt-0.5 pb-1.5 text-primary-foreground sm:rounded-3xl sm:px-5"
          >
            <RotatingText
              texts={AUDIENCES}
              auto={!reduced}
              rotationInterval={2400}
              staggerDuration={0.012}
              staggerFrom="last"
              splitBy="characters"
              transition={LETTER_TWEEN}
              mainClassName="overflow-hidden"
              splitLevelClassName="overflow-hidden pb-[0.08em]"
            />
          </motion.span>
        </span>
      </LayoutGroup>
      <span aria-hidden="true" className="block">
        and know it{" "}
        <span className="relative inline-block bg-gradient-to-r from-[#ff6a3d] to-[#ffb38a] bg-clip-text text-transparent">
          landed.
        </span>
      </span>
    </h1>
  );
}
