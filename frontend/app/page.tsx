import type { Metadata } from "next";
import Link from "next/link";
import { Check, Hash, Lock, MessageCircle, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Github } from "@/components/ui/icon/OAuthIcons";
import { PageBackdrop } from "@/components/landing/PageBackdrop";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { RevealHeading } from "@/components/landing/RevealHeading";
import { HeroHeadline } from "@/components/landing/HeroHeadline";
import { LiveChatDemo } from "@/components/landing/LiveChatDemo";
import { EveryoneSees } from "@/components/landing/EveryoneSees";
import SpotlightCard from "@/components/fx/spotlight-card";
import { StartCta } from "@/components/landing/StartCta";
import { Marquee } from "@/components/fx/marquee";

export const metadata: Metadata = {
  title: "ChatMee: chat with your people and know it landed",
  description:
    "Rooms for your groups, direct messages for one-on-ones, live presence and typing. Every message shows a check and the time the moment it is delivered.",
};

const REPOSITORY_URL = "https://github.com/N-Tien-L/ChatMee";

const FEATURES: { icon: typeof Check; title: string; body: string; wide?: boolean; full?: boolean }[] = [
  {
    icon: Check,
    title: "Know it landed",
    body: "Every message you send gets a check and the time the moment ChatMee has it. No more “did that go through?”",
    wide: true,
  },
  {
    icon: Hash,
    title: "Rooms for every group",
    body: "Open a public room anyone can discover, or keep a private one just for your members.",
  },
  {
    icon: MessageCircle,
    title: "Direct messages",
    body: "Start a one-on-one from a name. They accept first, so nobody lands in your inbox uninvited.",
  },
  {
    icon: Users,
    title: "See who's here",
    body: "Live presence and typing, so you know when someone is around and about to answer.",
  },
  {
    icon: ShieldCheck,
    title: "Members only",
    body: "Only a room's members receive its messages. Leave, and the room goes quiet for you.",
  },
  {
    icon: RefreshCw,
    title: "Drops don't lose messages",
    body: "Lost signal on the train? ChatMee reconnects by itself and catches you up without duplicates.",
    full: true,
  },
];

const CROWDS = [
  "Study groups",
  "Project teams",
  "Gaming squads",
  "Club committees",
  "Hackathon crews",
  "Weekend trips",
  "Book clubs",
  "Family plans",
  "Flatmates",
  "Lab partners",
];

const STACK = ["Spring Boot 4", "Spring Security", "STOMP over WebSocket", "MongoDB", "Redis", "Next.js 16"];

/** Public landing page (CM-084, owner-approved exception to SPEC-008 §2, decisions D-6 and D-14). */
export default function Home() {
  return (
    <div className="theme-public relative isolate min-h-dvh overflow-x-clip bg-background text-foreground">
      <SmoothScroll />
      <PageBackdrop />
      {/* Glows scroll with the content over the fixed mesh: teal at the top, ember toward the close. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[720px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(46_230_193/0.20),transparent)]" />
        <div className="absolute top-[38%] -left-60 h-[640px] w-[760px] rounded-full bg-[radial-gradient(closest-side,rgb(46_230_193/0.10),transparent)]" />
        <div className="absolute top-[62%] -right-60 h-[640px] w-[760px] rounded-full bg-[radial-gradient(closest-side,rgb(255_106_61/0.09),transparent)]" />
        <div className="absolute -bottom-40 left-1/2 h-[700px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_106_61/0.18),transparent)]" />
      </div>
      <header className="nav-glass sticky top-0 z-50">
        <div className="mx-auto flex max-w-[1240px] items-center gap-6 px-4 py-4 sm:px-8">
          <span className="pt-2 font-brand text-[26px] leading-none">ChatMee</span>
          <nav aria-label="Main" className="ml-auto flex items-center gap-5 text-sm text-muted-foreground sm:gap-7">
            <a href="#features" className="hidden rounded-sm hover:text-foreground sm:inline">
              Features
            </a>
            <a href="#under-the-hood" className="hidden rounded-sm hover:text-foreground sm:inline">
              Under the hood
            </a>
            <Link
              href="/login"
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 font-medium text-foreground backdrop-blur hover:bg-white/10"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative">
        <div className="relative z-10 mx-auto grid max-w-[1240px] items-center gap-14 px-4 pt-10 pb-24 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-20 lg:pb-32">
          <div>
            <p style={{ "--d": 0 } as React.CSSProperties} className="intro mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary text-primary animate-live" aria-hidden="true" />
              Free · open source · sign in with GitHub or Google
            </p>
            <HeroHeadline />
            <p style={{ "--d": 420 } as React.CSSProperties} className="intro mt-7 max-w-[520px] text-lg leading-relaxed text-muted-foreground">
              Rooms for the group, direct messages for the one-on-one, live presence and typing. And every message you
              send shows a check and the time the moment it&apos;s delivered.
            </p>
            <div style={{ "--d": 540 } as React.CSSProperties} className="intro mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <StartCta />
              <a href="#features" className="rounded-sm text-sm font-medium text-foreground underline-offset-4 hover:underline">
                See what it does
              </a>
            </div>
          </div>
          <div style={{ "--d": 650 } as React.CSSProperties} className="intro relative">
            <div
              aria-hidden="true"
              className="absolute -inset-8 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_70%_30%,rgb(255_106_61/0.18),transparent_60%)] blur-2xl"
            />
            <LiveChatDemo />
          </div>
        </div>
      </section>

      <section aria-label="Made for" className="py-6 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <Marquee pauseOnHover className="[--duration:36s] [--gap:2.5rem]">
          {CROWDS.map((crowd) => (
            <span key={crowd} className="flex items-center gap-2.5 font-display text-xl font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-spot" aria-hidden="true" />
              {crowd}
            </span>
          ))}
        </Marquee>
      </section>

      <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 py-24 sm:px-8 lg:grid-cols-2 lg:py-32">
        <div>
          <p className="font-mono text-xs tracking-[0.14em] text-primary">REAL TIME</p>
          <RevealHeading
            lines={["Send once.", "Everyone sees it."]}
            className="mt-4 font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl"
          />
          <p className="mt-5 max-w-[460px] text-lg leading-relaxed text-muted-foreground">
            Your message reaches every member&apos;s phone, laptop and tablet at the same moment, and you see the check as
            soon as it&apos;s there. No refresh, no waiting.
          </p>
        </div>
        <EveryoneSees />
      </section>

      <section id="features" aria-labelledby="features-title" className="scroll-mt-24 mx-auto max-w-[1240px] px-4 pb-24 sm:px-8 lg:pb-32">
        <div>
          <p className="font-mono text-xs tracking-[0.14em] text-primary">FEATURES</p>
          <RevealHeading
            id="features-title"
            lines={["Everything a group chat needs.", "Nothing it doesn't."]}
            className="mt-4 max-w-[640px] font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl"
          />
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className={feature.full ? "sm:col-span-2 lg:col-span-3" : feature.wide ? "lg:col-span-2" : ""}>
              <div className="reveal h-full">
                <SpotlightCard
                  theme="dark"
                  spotlightColor="rgba(46, 230, 193, 0.35)"
                  className="h-full !rounded-3xl !bg-[#0b1a18] p-7"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary">
                    <feature.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 font-display text-xl font-semibold">{feature.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{feature.body}</p>
                </SpotlightCard>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="under-the-hood"
        aria-labelledby="hood-title"
        className="scroll-mt-24 mx-auto max-w-[1240px] px-4 pb-24 sm:px-8 lg:pb-32"
      >
        <div className="grid gap-10 rounded-3xl border border-white/10 bg-white/[0.02] p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="font-mono text-xs tracking-[0.14em] text-primary">UNDER THE HOOD</p>
            <RevealHeading
              id="hood-title"
              lines={["Built by hand, open to read."]}
              className="mt-4 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl"
            />
            <p className="mt-4 max-w-[560px] leading-relaxed text-muted-foreground">
              A Spring Boot server validates and stores every message in MongoDB before it goes out over STOMP. Redis keeps
              presence in step across instances. The check you see is the server&apos;s confirmation, not a guess.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Technology">
              {STACK.map((item) => (
                <li key={item} className="rounded-full border border-white/10 px-3 py-1 font-mono text-xs text-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <a
            href={REPOSITORY_URL}
            className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 px-5 py-3 text-sm font-medium hover:bg-white/5 lg:self-end"
          >
            <Github className="h-4 w-4 [&_g]:fill-current" aria-hidden="true" />
            Read the source
          </a>
        </div>
      </section>

      <section aria-labelledby="cta-title" className="relative">
        <div className="relative z-10 mx-auto flex max-w-[1240px] flex-col items-center px-4 py-28 text-center sm:px-8">
          <RevealHeading
            id="cta-title"
            lines={["Your people are waiting."]}
            className="font-display text-4xl font-bold tracking-[-0.03em] sm:text-6xl"
          />
          <p className="mt-4 text-lg text-muted-foreground">Open a room, say hi, watch it land.</p>
          <div className="mt-9">
            <StartCta />
          </div>
          <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden="true" /> GitHub or Google sign-in. ChatMee never sees a password.
          </p>
        </div>
      </section>

      <footer>
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-8">
          <span className="pt-1 font-brand text-xl text-foreground">ChatMee</span>
          <span>An open-source portfolio project.</span>
          <a href={REPOSITORY_URL} className="rounded-sm hover:text-foreground">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
