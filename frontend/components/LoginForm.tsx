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
import { useAuthStore } from "@/lib/stores";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import toast from "react-hot-toast";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { login, loading } = useAuthStore();
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "true";
  const signedOut = searchParams.get("signedOut") === "true";

  useEffect(() => {
    if (hasError) {
      toast.error("Login failed. Please try again.", { id: "login-error" });
    }
  }, [hasError]);

  useEffect(() => {
    if (signedOut) {
      toast.success("Signed out successfully", { id: "signed-out" });
    }
  }, [signedOut]);

  return (
    <div
      className={cn("w-full max-w-md mx-auto px-4 sm:px-0", className)}
      {...props}
    >
      <Card className="backdrop-blur-sm bg-white/10 border-white/20 shadow-2xl rounded-2xl">
        <CardHeader className="text-center space-y-2 p-4 sm:p-6">
          <CardTitle className="text-xl font-semibold text-white">
            Sign in to ChatMee
          </CardTitle>
          <CardDescription className="text-white/80 text-sm sm:text-base">
            Continue with your Google or GitHub account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
          <Button
            variant="outline"
            className="w-full h-12 text-sm sm:text-base bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
            onClick={() => login("google")}
            disabled={loading}
          >
            <Google className="w-5 h-5 mr-2" />
            <span className="truncate">
              {loading ? "Redirecting..." : "Continue with Google"}
            </span>
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-sm sm:text-base bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
            onClick={() => login("github")}
            disabled={loading}
          >
            <Github className="w-5 h-5 mr-2" />
            <span className="truncate">
              {loading ? "Redirecting..." : "Continue with GitHub"}
            </span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
