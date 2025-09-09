"use client";

import LoginBackGround from "@/components/background/LoginBackGround";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Background layer */}
      <div className="absolute inset-0 z-0">
        <LoginBackGround />
      </div>

      {/* Content layer */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
