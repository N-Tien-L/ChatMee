"use client";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "./ui/button";
import { Github, Google } from "./ui/icon/OAuthIcons";
import { useEffect, useRef, useState } from "react";
import { FlipWords } from "./ui/shadcn-io/flip-words";
import { useAuthStore } from "@/lib/stores";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const words = ["join", "chat", "share"];

  // Use the auth hook
  const { login, loading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    };

    // Add event listener to document instead of just the card element
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // If already authenticated, you might want to redirect or show a different UI
  if (isAuthenticated) {
    return (
      <div
        className={cn("w-full max-w-md mx-auto text-center px-4", className)}
      >
        <p className="text-white text-3xl sm:text-4xl md:text-5xl jersey-10-regular">
          You are already logged in!
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("w-full max-w-md mx-auto px-4 sm:px-0", className)}
      {...props}
    >
      {/* Animated border wrapper */}
      <div
        ref={cardRef}
        className="relative w-full rounded-2xl p-[1px] overflow-hidden group"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(99, 102, 241, 0.4), transparent 40%)`,
        }}
      >
        {/* Glow effect that follows mouse */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(300px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(99, 102, 241, 0.15), transparent 40%)`,
          }}
        />

        {/* Main card with backdrop blur */}
        <Card className="relative backdrop-blur-sm bg-white/10 border-white/20 shadow-2xl rounded-2xl z-10">
          <CardHeader className="text-center space-y-2 sm:space-y-4 p-4 sm:p-6">
            <CardTitle className="font-bold text-white">
              <div className="flex justify-center items-center p-2 sm:p-4">
                <div className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-center max-w-2xl jersey-10-regular">
                  Let's{" "}
                  <FlipWords
                    words={words}
                    duration={1800}
                    className="text-cyan-400"
                  />
                  !
                </div>
              </div>
            </CardTitle>
            <CardDescription className="text-gray-200 text-sm sm:text-base px-2">
              Login with your Google or Github account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
            <Button
              variant="outline"
              className="w-full h-12 sm:h-14 text-sm sm:text-base bg-white/10 border-white/20 text-white hover:bg-white/20 hover:shadow-[0_0_20px_rgba(34,197,94,0.6)] hover:border-green-400/50 transition-all duration-300 group"
              onClick={() => login("google")}
              disabled={loading}
            >
              <Google className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3 group-hover:scale-110 transition-transform duration-300" />
              <span className="truncate">
                {loading ? "Redirecting..." : "Continue with Google"}
              </span>
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 sm:h-14 text-sm sm:text-base bg-white/10 border-white/20 text-white hover:bg-white/20 hover:shadow-[0_0_20px_rgba(88,166,255,0.5)] hover:border-blue-400/50 transition-all duration-300 group"
              onClick={() => login("github")}
              disabled={loading}
            >
              <Github className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3 group-hover:scale-110 transition-transform duration-300" />
              <span className="truncate">
                {loading ? "Redirecting..." : "Continue with Github"}
              </span>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 sm:mt-4 text-center text-xs sm:text-sm text-gray-500 px-4">
        By continuing, you agree to our{" "}
        <a
          href="#"
          className="underline underline-offset-2 hover:text-gray-400 whitespace-nowrap"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href="#"
          className="underline underline-offset-2 hover:text-gray-400 whitespace-nowrap"
        >
          Privacy Policy
        </a>
        .
      </div>
    </div>
  );
}
