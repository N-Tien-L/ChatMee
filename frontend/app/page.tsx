import type { Metadata } from "next";
import Link from "next/link";
import { Github } from "@/components/ui/icon/OAuthIcons";
import { QslCard } from "@/components/landing/QslCard";
import { oauthLoginUrl } from "@/lib/api/authApi";

export const metadata: Metadata = {
  title: "ChatMee: every message, confirmed both ways",
  description:
    "A real-time chat app with a hand-built realtime layer: rooms, direct messages, presence and typing on Spring Boot and STOMP.",
};

const REPOSITORY_URL = "https://github.com/N-Tien-L/ChatMee";

const FACTS = [
  {
    title: "Nothing sent twice",
    body: "A resend with the same client id returns the message already stored.",
    mechanism: "unique (chatRoomId, senderId, clientMessageId)",
  },
  {
    title: "Back after a drop",
    body: "Reconnects with capped backoff and jitter, a fresh single-use token each try, then merges missed messages by id.",
    mechanism: "POST /api/v1/auth/ws-token · CONNECT · resync",
  },
  {
    title: "Only for members",
    body: "Every subscription is checked against membership; leaving a room stops its frames.",
    mechanism: "/topic/rooms/{id} · /user/queue/events",
  },
];

const STACK = ["Spring Boot 4", "STOMP / WebSocket", "MongoDB", "Redis", "Next.js 16"];

/** Public landing page (CM-084, owner-approved exception to SPEC-008 §2, decision D-6). */
export default function Home() {
  return (
    <div className="theme-public min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-[1312px] items-center gap-6 px-4 py-5 sm:px-8 lg:px-16">
        <span className="pt-2 font-brand text-[26px] leading-none">ChatMee</span>
        <nav aria-label="Main" className="ml-auto flex items-center gap-5 text-sm text-muted-foreground sm:gap-7">
          <a href="#how" className="hidden rounded-sm hover:text-foreground sm:inline">
            How it works
          </a>
          <a href={REPOSITORY_URL} className="hidden rounded-sm hover:text-foreground sm:inline">
            GitHub
          </a>
          <Link
            href="/login"
            className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid max-w-[1312px] gap-12 px-4 pt-6 pb-16 sm:px-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-14 lg:px-16 lg:pt-10">
        <div>
          <h1 className="text-[40px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[56px]">
            Every message, <span className="text-highlight">confirmed</span> both ways.
          </h1>
          <p className="mt-5 max-w-[460px] text-lg text-muted-foreground">
            A real-time chat app with a hand-built realtime layer: rooms, direct messages, presence and typing, on Spring
            Boot and STOMP.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <a
              href={oauthLoginUrl("github")}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Github className="h-5 w-5 [&_g]:fill-current" aria-hidden="true" />
              Sign in with GitHub
            </a>
            <span className="text-sm text-muted-foreground">
              or{" "}
              <a href={oauthLoginUrl("google")} className="rounded-sm text-foreground underline underline-offset-4">
                Google
              </a>
              . No passwords.
            </span>
          </div>
          <p className="mt-12 font-mono text-xs tracking-[0.06em] text-muted-foreground">
            BUILT WITH{" "}
            {STACK.map((item, index) => (
              <span key={item}>
                <span className="text-foreground">{item}</span>
                {index < STACK.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        </div>

        <div className="lg:pt-2">
          <QslCard />
        </div>

        <section id="how" aria-labelledby="how-title" className="border-t border-border pt-6 lg:col-span-2">
          <h2 id="how-title" className="sr-only">
            How it works
          </h2>
          <ul className="grid gap-8 md:grid-cols-3 md:gap-6">
            {FACTS.map((fact) => (
              <li key={fact.title}>
                <p className="font-semibold">{fact.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{fact.body}</p>
                <code className="mt-2 block font-mono text-xs text-highlight">{fact.mechanism}</code>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
