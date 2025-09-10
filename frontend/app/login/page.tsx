"use client";

import { LoginForm } from "@/components/LoginForm";
import BlurText from "@/components/ui/shadcn-io/blur-text";
import { motion } from "framer-motion";
import React from "react";

const Login = () => {
  return (
    <div className="flex flex-col justify-center items-center space-y-10">
      <BlurText
        text="Welcome to Chatmee"
        delay={333}
        animateBy="words"
        direction="top"
        className="text-7xl text-green-300 font-[borel] text-center max-w-4xl"
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
