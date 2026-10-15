"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { BorderBeam } from "@/components/fx/border-beam";
import { usePrefersReducedMotion } from "@/components/fx/use-prefers-reduced-motion";

type Line =
  | { kind: "them"; who: string; initial: string; text: string; time: string }
  | { kind: "me"; text: string; time: string }
  | { kind: "typing"; who: string };

/** The scripted demo conversation. Each step adds or replaces the last line; "me" lines confirm after a beat. */
const SCRIPT: Line[] = [
  { kind: "them", who: "Lan", initial: "L", text: "Who's still up for the night market on Saturday?", time: "20:12" },
  { kind: "typing", who: "Minh" },
  { kind: "them", who: "Minh", initial: "M", text: "Me! I'll bring the cash for the dumplings.", time: "20:13" },
  { kind: "me", text: "In. Meet at the north gate at 7?", time: "20:14" },
  { kind: "typing", who: "Lan" },
  { kind: "them", who: "Lan", initial: "L", text: "Perfect. See you both there.", time: "20:14" },
];

const STEP_MS = 1500;
const CONFIRM_MS = 900;
const REST_MS = 3200;

/** Lines visible after `step` steps: typing lines show only while they are the newest line. */
function linesAt(step: number): Line[] {
  const shown = SCRIPT.slice(0, step);
  return shown.filter((line, index) => line.kind !== "typing" || index === shown.length - 1);
}

/**
 * The landing's signature: a room where your message goes out, then confirms with a check and the time.
 * Demo data only (labelled). Under reduced motion it shows the finished conversation without playback.
 */
export function LiveChatDemo() {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(SCRIPT.length);
  const [confirmed, setConfirmed] = useState(true);

  // The server render and reduced motion show the finished conversation; playback starts after a short rest.
  useEffect(() => {
    if (reduced) return;
    let current = SCRIPT.length;
    let timer: ReturnType<typeof setTimeout>;
    let confirmTimer: ReturnType<typeof setTimeout> | undefined;
    const advance = () => {
      if (current >= SCRIPT.length) {
        current = 1;
        setStep(1);
        setConfirmed(false);
        timer = setTimeout(advance, STEP_MS);
        return;
      }
      current += 1;
      setStep(current);
      if (SCRIPT[current - 1].kind === "me") {
        setConfirmed(false);
        confirmTimer = setTimeout(() => setConfirmed(true), CONFIRM_MS);
      }
      timer = setTimeout(advance, current >= SCRIPT.length ? REST_MS : STEP_MS);
    };
    timer = setTimeout(advance, REST_MS);
    return () => {
      clearTimeout(timer);
      clearTimeout(confirmTimer);
    };
  }, [reduced]);

  const lines = linesAt(reduced ? SCRIPT.length : step);

  return (
    <figure
      aria-label="Demo conversation in a ChatMee room"
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a1715]/85 shadow-[0_40px_120px_-30px_rgb(46_230_193/0.35)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 font-display text-lg font-semibold text-primary">
          #
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-semibold leading-tight">night-market-crew</p>
          <p className="text-xs text-muted-foreground">3 members · 3 online</p>
        </div>
        <div className="flex -space-x-2" aria-hidden="true">
          {["L", "M", "Y"].map((initial, index) => (
            <span
              key={initial}
              className="relative grid h-7 w-7 place-items-center rounded-full border-2 border-[#0a1715] text-[11px] font-semibold text-[#03201b]"
              style={{ background: ["#2ee6c1", "#ffb38a", "#9ad8ff"][index] }}
            >
              {initial}
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a1715] bg-[#3ddc84]" />
            </span>
          ))}
        </div>
      </div>

      <ol className="flex h-[300px] flex-col justify-end gap-3 px-5 py-5 sm:h-[330px]" aria-live="off">
        {lines.map((line, index) => {
          const key = `${index}-${line.kind}`;
          if (line.kind === "typing") {
            return (
              <li key={key} className="animate-message-in flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-bounce"
                      style={{ animationDelay: `${dot * 120}ms` }}
                    />
                  ))}
                </span>
                {line.who} is typing
              </li>
            );
          }
          if (line.kind === "them") {
            return (
              <li key={key} className="animate-message-in flex items-end gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[11px] font-semibold text-[#03201b]"
                  style={{ background: line.initial === "L" ? "#2ee6c1" : "#ffb38a" }}
                >
                  {line.initial}
                </span>
                <div className="max-w-[78%]">
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {line.who} · <span className="tabular">{line.time}</span>
                  </p>
                  <p className="rounded-2xl rounded-bl-md bg-white/[0.07] px-3.5 py-2 text-sm leading-snug">{line.text}</p>
                </div>
              </li>
            );
          }
          const isLatest = index === lines.length - 1 || lines.slice(index + 1).every((l) => l.kind === "typing");
          const done = reduced || confirmed || !isLatest;
          return (
            <li key={key} className="animate-message-in flex flex-col items-end">
              <p
                className={`max-w-[78%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-snug transition-colors duration-300 ${
                  done
                    ? "animate-confirm bg-gradient-to-br from-[#2ee6c1] to-[#16b597] text-[#03201b]"
                    : "border border-dashed border-primary/60 text-foreground"
                }`}
              >
                {line.text}
              </p>
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium tabular">
                {done ? (
                  <span className="flex items-center gap-1 text-spot">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                    Confirmed {line.time}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sending…</span>
                )}
              </p>
            </li>
          );
        })}
      </ol>

      <figcaption className="flex items-center justify-between border-t border-white/10 px-5 py-3 font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
        <span>DEMO DATA</span>
        <span>REAL-TIME · CONFIRMED BY THE SERVER</span>
      </figcaption>
      <BorderBeam size={120} duration={9} colorFrom="#2ee6c1" colorTo="#ff6a3d" />
    </figure>
  );
}
