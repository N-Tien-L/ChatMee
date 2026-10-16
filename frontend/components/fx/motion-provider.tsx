"use client";

import { MotionConfig } from "motion/react";

/** Every `motion` animation in the app follows the user's reduced-motion setting (fx components included). */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
