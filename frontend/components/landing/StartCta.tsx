"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useMotionValue, useSpring } from "motion/react";
import StarBorder from "@/components/fx/star-border";
import ClickSpark from "@/components/fx/click-spark";

const PULL = 0.22;
const MAX_PULL = 8;

/**
 * The landing's one primary action: sign-in link in the React Bits star border, pulled gently toward the pointer
 * (magnetic) and bursting a few sparks on click (React Bits ClickSpark), a nod to "it landed".
 * Under reduced motion the MotionProvider stills the pull and ClickSpark shortens its burst.
 */
export function StartCta({ label = "Start chatting free" }: { label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 260, damping: 18 });
  const springY = useSpring(y, { stiffness: 260, damping: 18 });

  const onMove = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const clampPull = (v: number) => Math.max(-MAX_PULL, Math.min(MAX_PULL, v * PULL));
    x.set(clampPull(event.clientX - (box.left + box.width / 2)));
    y.set(clampPull(event.clientY - (box.top + box.height / 2)));
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ x: springX, y: springY }}
      className="inline-block"
    >
      <ClickSpark sparkColor={["#2ee6c1", "#ff6a3d", "#eaf5f2"]} sparkCount={10} sparkRadius={26} className="!h-auto !w-auto">
        <StarBorder
          as={Link}
          href="/login"
          theme="dark"
          color="#2ee6c1"
          trailColor="#ff6a3d"
          radius={14}
          backgroundColor="#2ee6c1"
          textColor="#03201b"
          className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold"
        >
          {label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </StarBorder>
      </ClickSpark>
    </motion.div>
  );
}
