"use client";

import { LoginForm } from "@/components/LoginForm";
import BlurText from "@/components/ui/shadcn-io/blur-text";
import React from "react";

const Login = () => {
  return (
    <div className="flex flex-col justify-center items-center space-y-10">
      <BlurText
        text="Welcome to Chatmee"
        delay={500}
        animateBy="words"
        direction="top"
        className="text-7xl text-green-300 font-[borel] text-center max-w-4xl"
      />
      <LoginForm />
    </div>
  );
};

export default Login;
