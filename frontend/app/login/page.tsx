"use client";

import { LoginForm } from "@/components/LoginForm";
import BlurText from "@/components/ui/shadcn-io/blur-text";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import toast from "react-hot-toast";
import React from "react";

const Login = () => {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'true') {
      toast.error('Login failed. Please try again.', {
        id: 'login-error', // Prevent duplicate toasts
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
