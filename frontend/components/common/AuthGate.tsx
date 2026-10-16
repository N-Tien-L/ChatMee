"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/lib/stores/authStore";

function GateSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading ChatMee"
      className="flex h-dvh flex-col bg-background"
    >
      <div className="flex h-14 items-center border-b px-4">
        <span className="font-brand text-xl text-primary">ChatMee</span>
        <Skeleton className="ml-auto h-8 w-8 rounded-full" />
      </div>
      <div className="flex flex-1 gap-0">
        <div className="hidden w-80 space-y-3 border-r p-4 md:block">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <div className="flex-1 space-y-3 p-4 md:hidden">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <div className="hidden flex-1 bg-muted/40 md:block" />
      </div>
    </div>
  );
}

/**
 * Verifies the session once before the protected area renders. Visitors without a session are
 * redirected to /login while the branded skeleton stays on screen (no "Access Denied" flash).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loading = useAuthStore((state) => state.loading);
  const checkAuthStatus = useAuthStore((state) => state.checkAuthStatus);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkAuthStatus().then(() => {
      if (!cancelled) setHasChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [checkAuthStatus]);

  const ready = hasChecked && !loading;

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login");
  }, [ready, isAuthenticated, router]);

  if (!ready || !isAuthenticated) return <GateSkeleton />;
  return <>{children}</>;
}
