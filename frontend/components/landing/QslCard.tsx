"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

interface ExchangeRow {
  time: string;
  from: string;
  text: string;
  frame: string;
  confirmed: boolean | null;
}

/** Demo data; destinations follow docs/design/websocket-protocol.md. */
const ROWS: ExchangeRow[] = [
  { time: "07:01:12", from: "lan", text: "If my resend fires twice, do you get two?", frame: "SEND /app/chat.sendMessage", confirmed: true },
  { time: "07:01:12", from: "server", text: "Stored once, then broadcast to members", frame: "MESSAGE /topic/rooms/42", confirmed: true },
  { time: "07:01:15", from: "minh", text: "typing…", frame: "MESSAGE /topic/rooms/42/typing", confirmed: null },
  { time: "07:01:19", from: "minh", text: "One. Same tempId, same stored message.", frame: "SEND /app/chat.sendMessage", confirmed: true },
];

const ROW_DELAY_S = 0.45;
/** The last row confirms after the rows have printed, like a real echo arriving. */
const ECHO_DELAY_MS = (ROWS.length * ROW_DELAY_S + 0.9) * 1000;

function Mark({ confirmed }: { confirmed: boolean | null }) {
  if (confirmed === null) return <span className="text-muted-foreground" aria-label="No confirmation needed">—</span>;
  if (!confirmed)
    return (
      <span className="inline-flex rounded-[3px] border border-dashed border-muted-foreground px-1.5 text-[11px] leading-[18px] text-muted-foreground">
        Sending…
      </span>
    );
  return (
    <span className="inline-flex -rotate-[1.5deg] items-center gap-1 rounded-[3px] border-[1.5px] border-primary px-1.5 text-[11px] leading-[18px] text-primary">
      <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">confirmed</span>
    </span>
  );
}

/**
 * ChatMee's own contact-confirmation card (CM-084 landing). The exchange prints in once, then rests;
 * with reduced motion the final card shows at once.
 */
export function QslCard() {
  const reduceMotion = useReducedMotion();
  const [echoed, setEchoed] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setTimeout(() => setEchoed(true), ECHO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  const lastConfirmed = reduceMotion || echoed;

  return (
    <figure
      aria-label="Demo: one confirmed exchange and the STOMP frames behind it"
      className="theme-paper relative rounded-md bg-background px-5 py-6 text-foreground shadow-[0_30px_60px_rgb(0_0_0/0.45)] sm:-rotate-[1.2deg] sm:px-8 sm:py-7"
    >
      <span className="absolute -top-3 right-5 rounded-[3px] bg-foreground px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] text-background">
        DEMO DATA
      </span>
      <div className="flex items-end gap-4 border-b-2 border-primary pb-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground">CONTACT CONFIRMATION</p>
          <p className="text-4xl font-extrabold leading-[0.9] tracking-[-0.03em] text-primary sm:text-[54px]">ChatMee</p>
        </div>
        <p className="ml-auto flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-spot">
          <span className="h-2 w-2 rounded-full bg-spot" aria-hidden="true" />
          ON AIR
        </p>
      </div>

      <table className="mt-3 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <th scope="col" className="py-1.5 pr-2 font-medium">UTC</th>
            <th scope="col" className="hidden py-1.5 pr-2 font-medium sm:table-cell">From</th>
            <th scope="col" className="py-1.5 pr-2 font-medium">Message</th>
            <th scope="col" className="hidden py-1.5 pr-2 font-medium md:table-cell">Frame</th>
            <th scope="col" className="py-1.5 font-medium"><Check className="h-3 w-3 sm:hidden" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Confirmed</span></th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, index) => {
            const isLast = index === ROWS.length - 1;
            return (
              <motion.tr
                key={`${row.time}-${index}`}
                className="border-b border-border/70 align-top"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * ROW_DELAY_S, duration: 0.3, ease: "easeOut" }}
              >
                <td className="py-2.5 pr-2 font-mono text-xs tabular">{row.time}</td>
                <td className="hidden py-2.5 pr-2 font-mono text-xs sm:table-cell">{row.from}</td>
                <td className="py-2.5 pr-2 text-sm">
                  <span className="block font-mono text-[11px] text-muted-foreground sm:hidden">{row.from}</span>
                  {row.text}
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground md:hidden">{row.frame}</span>
                </td>
                <td className="hidden py-2.5 pr-2 font-mono text-xs md:table-cell xl:whitespace-nowrap">{row.frame}</td>
                <td className="py-2 font-mono">
                  <Mark confirmed={isLast ? (lastConfirmed ? true : false) : row.confirmed} />
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>

      <dl className="mt-3.5 flex flex-wrap justify-between gap-x-6 gap-y-1 font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
        <div className="flex gap-1.5"><dt>MODE</dt><dd>STOMP / WEBSOCKET</dd></div>
        <div className="flex gap-1.5"><dt>AUTH</dt><dd>OAUTH2 SESSION + WS TOKEN</dd></div>
        <div className="flex gap-1.5"><dt>PRESENCE</dt><dd>REDIS</dd></div>
      </dl>
    </figure>
  );
}
