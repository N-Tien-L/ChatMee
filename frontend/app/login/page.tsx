"use client";

import { LoginForm } from "@/components/LoginForm";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useAuthStore } from "@/lib/stores/authStore";
import toast from "react-hot-toast";
import React from "react";
import { useShallow } from "zustand/react/shallow";

const LoginContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuthStore(
    useShallow((state) => ({
      isAuthenticated: state.isAuthenticated,
      loading: state.loading,
    }))
  );
  const checkAuthStatus = useAuthStore((state) => state.checkAuthStatus);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  useEffect(() => {
    const fetchAuthStatus = async () => {
      await checkAuthStatus();
      setHasCheckedAuth(true); // Mark that we've checked
    };
    fetchAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    // Only redirect after initial auth check is done
    if (hasCheckedAuth && !loading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [hasCheckedAuth, isAuthenticated, loading, router]);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "true") {
      toast.error("Login failed. Please try again.", {
        id: "login-error", // Prevent duplicate toasts
      });
    }
  }, [searchParams]);

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
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-screen">
          Loading...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
};

export default Login;
