"use client";

import { LoginForm } from "@/components/LoginForm";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import { useAuthStore } from "@/lib/stores/authStore";

function LoginSkeleton() {
  return (
    <div
      role="status"
      aria-label="Checking your session"
      className="flex flex-col items-center space-y-6 px-4"
    >
      <Skeleton className="h-14 w-56" />
      <Skeleton className="h-48 w-full max-w-md rounded-2xl" />
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
  const [checked, setChecked] = useState(false);

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
    <div className="flex flex-col justify-center items-center space-y-6 sm:space-y-8 px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="font-brand text-5xl sm:text-6xl md:text-7xl text-white">
          ChatMee
        </h1>
        <p className="mt-2 text-base sm:text-lg text-white/80">
          Real-time chat with friends and communities
        </p>
      </div>
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
