export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-public flex min-h-dvh w-full items-center justify-center bg-background p-safe px-4 py-10 text-foreground">
      {children}
    </div>
  );
}
