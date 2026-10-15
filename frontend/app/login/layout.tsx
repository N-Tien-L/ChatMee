import { HeroLight } from "@/components/landing/HeroLight";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-public relative isolate flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background p-safe px-4 py-10 text-foreground">
      <HeroLight />
      <div className="relative z-10 flex w-full justify-center">{children}</div>
    </div>
  );
}
