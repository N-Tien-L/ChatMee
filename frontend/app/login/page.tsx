"use client";

import { LoginForm } from "@/components/LoginForm";
import BlurText from "@/components/ui/shadcn-io/blur-text";
import { motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/authStore";
import toast from "react-hot-toast";
import React from "react";
import { useShallow } from "zustand/react/shallow";

const Login = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAuthenticated, loading } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
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
    <div className="flex flex-col justify-center items-center space-y-10">
      <BlurText
        text="Welcome to Chatmee"
        delay={333}
        animateBy="words"
        direction="top"
        className="text-7xl text-green-300 font-semibold borel-regular text-center max-w-4xl"
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
      >
        <LoginForm />
      </motion.div>
    </div>
  );
};

export default Login;
