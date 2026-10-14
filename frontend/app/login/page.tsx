"use client";

import { LoginForm } from "@/components/LoginForm";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import { useAuthStore } from "@/lib/stores/authStore";

function LoginSkeleton() {
  return (
    <div
      role="status"
      aria-label="Checking your session"
      className="flex w-full max-w-sm flex-col items-center gap-6"
    >
      <Skeleton className="h-12 w-44 bg-muted" />
      <Skeleton className="h-56 w-full rounded-md bg-muted" />
    </div>
  );
}

const LoginContent = () => {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const checkAuthStatus = useAuthStore((state) => state.checkAuthStatus);
  const unreachable = useAuthStore((state) => state.unreachable);
  const expired = useSearchParams().get("reason") === "expired";
  const [checked, setChecked] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    await checkAuthStatus();
    setRetrying(false);
    if (useAuthStore.getState().isAuthenticated) routerRef.current.replace("/dashboard");
  };

  // The server decides: /auth/me 200 -> dashboard, 401 -> the form. Nothing client-side gates this.
  useEffect(() => {
    let cancelled = false;
    checkAuthStatus().then(() => {
      if (cancelled) return;
      if (useAuthStore.getState().isAuthenticated) {
        routerRef.current.replace("/dashboard");
      } else {
        setChecked(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checkAuthStatus]);

  if (!checked) return <LoginSkeleton />;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Link href="/" className="rounded-sm pt-2 font-brand text-5xl leading-none">
          ChatMee
        </Link>
        <p className="text-sm text-muted-foreground">Your rooms and people are one click away.</p>
      </div>
      {unreachable ? (
        <div role="alert" className="rounded-xl border border-warning/40 bg-warning-surface px-4 py-3 text-sm">
          <p className="font-semibold text-warning">Can&apos;t reach ChatMee right now.</p>
          <p className="mt-1 text-muted-foreground">
            The server may be waking up. Try again in a minute.
          </p>
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className="mt-2 rounded-sm font-semibold text-foreground underline underline-offset-4 disabled:opacity-60"
          >
            {retrying ? "Checking…" : "Try again"}
          </button>
        </div>
      ) : (
        expired && (
          <p role="status" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            Your session ended. Sign in again.
          </p>
        )
      )}
      <LoginForm />
    </div>
  );
};

const Login = () => {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent />
    </Suspense>
  );
};

export default Login;
