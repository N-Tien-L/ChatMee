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
      className={cn("w-full", className)}
      {...props}
    >
      <Card className="gap-0 rounded-md border-border bg-secondary py-0 text-foreground shadow-none">
        <CardHeader className="space-y-1 border-b border-border p-5">
          <CardTitle className="text-lg font-semibold text-foreground">
            Sign in to ChatMee
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            With your GitHub or Google account. No passwords.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          <Button
            className="h-11 w-full text-sm font-semibold"
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
            className="h-11 w-full border-border bg-transparent text-sm text-foreground hover:bg-accent hover:text-foreground"
            onClick={() => login("google")}
            disabled={loading}
          >
            <Google className="w-5 h-5 mr-2" />
            <span className="truncate">
              {loading ? "Redirecting..." : "Continue with Google"}
            </span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
