"use client";

import LoginBackGround from "@/components/background/LoginBackGround";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full min-h-screen h-screen overflow-hidden">
      {/* Background layer */}
      <div className="absolute inset-0 z-0">
        <LoginBackGround />
      </div>

      {/* Content layer with safe area padding for mobile */}
      <div className="absolute inset-0 z-10 flex items-center justify-center p-safe">
        {children}
      </div>
    </div>
  );
}
