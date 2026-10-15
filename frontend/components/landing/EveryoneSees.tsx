"use client";

import { useRef, type RefObject } from "react";
import { Laptop, MessageCircle, Smartphone, Tablet, Monitor, type LucideIcon } from "lucide-react";
import { AnimatedBeam } from "@/components/fx/animated-beam";

const node =
  "relative z-10 grid place-items-center rounded-2xl border border-white/10 bg-[#0b1a18] text-foreground shadow-[0_0_40px_-12px_rgb(46_230_193/0.5)]";

function Device({ nodeRef, icon: Icon, label }: { nodeRef: RefObject<HTMLDivElement | null>; icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div ref={nodeRef} className={`${node} h-12 w-12`}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="hidden text-xs text-muted-foreground sm:inline">{label}</span>
    </div>
  );
}

/** One message fans out from you to every member's device at once (Magic UI animated beams, decorative). */
export function EveryoneSees() {
  const containerRef = useRef<HTMLDivElement>(null);
  const youRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const cRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="relative flex h-[300px] w-full items-center justify-between overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-6 sm:px-14"
    >
      <div className="flex flex-col items-center gap-2">
        <div ref={youRef} className={`${node} h-14 w-14`}>
          <Monitor className="h-6 w-6" />
        </div>
        <span className="text-xs text-muted-foreground">You</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div ref={hubRef} className={`${node} h-20 w-20 border-primary/40 bg-primary/10`}>
          <MessageCircle className="h-8 w-8 text-primary" />
        </div>
        <span className="text-xs text-muted-foreground">ChatMee</span>
      </div>

      <div className="flex flex-col gap-6">
        <Device nodeRef={aRef} icon={Smartphone} label="Lan's phone" />
        <Device nodeRef={bRef} icon={Laptop} label="Minh's laptop" />
        <Device nodeRef={cRef} icon={Tablet} label="Yen's tablet" />
      </div>

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={youRef}
        toRef={hubRef}
        duration={3}
        pathColor="#2ee6c1"
        gradientStartColor="#2ee6c1"
        gradientStopColor="#ff6a3d"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={hubRef}
        toRef={aRef}
        curvature={60}
        duration={3}
        delay={0.6}
        pathColor="#2ee6c1"
        gradientStartColor="#2ee6c1"
        gradientStopColor="#ff6a3d"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={hubRef}
        toRef={bRef}
        curvature={0}
        duration={3}
        delay={0.6}
        pathColor="#2ee6c1"
        gradientStartColor="#2ee6c1"
        gradientStopColor="#ff6a3d"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={hubRef}
        toRef={cRef}
        curvature={-60}
        duration={3}
        delay={0.6}
        pathColor="#2ee6c1"
        gradientStartColor="#2ee6c1"
        gradientStopColor="#ff6a3d"
      />
    </div>
  );
}
