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
import { BorderBeam } from "@/components/fx/border-beam";
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
      className={cn("w-full", className)}
      {...props}
    >
      <Card className="relative gap-0 overflow-hidden rounded-2xl border-white/10 bg-[#0a1715]/80 py-0 text-foreground shadow-[0_40px_120px_-30px_rgb(46_230_193/0.35)] backdrop-blur-xl">
        <CardHeader className="space-y-1.5 border-b border-white/10 p-6">
          <CardTitle className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Sign in to ChatMee
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            With your GitHub or Google account. No passwords.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-6">
          <Button
            className="h-12 w-full rounded-xl text-sm font-semibold shadow-[0_0_30px_-8px_rgb(46_230_193/0.7)]"
            onClick={() => login("github")}
            disabled={loading}
          >
            <Github className="w-5 h-5 mr-2 [&_g]:fill-current" />
            <span className="truncate">
              {loading ? "Redirecting..." : "Continue with GitHub"}
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full rounded-xl border-white/15 bg-white/5 text-sm text-foreground hover:bg-white/10 hover:text-foreground"
            onClick={() => login("google")}
            disabled={loading}
          >
            <Google className="w-5 h-5 mr-2" />
            <span className="truncate">
              {loading ? "Redirecting..." : "Continue with Google"}
            </span>
          </Button>
        </CardContent>
        <BorderBeam size={110} duration={8} colorFrom="#2ee6c1" colorTo="#ff6a3d" />
      </Card>
    </div>
  );
}
