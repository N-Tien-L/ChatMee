import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { avatarTone } from "./avatarTone";

type UserAvatarSize = "sm" | "md" | "lg" | "xl";

interface UserAvatarProps {
  name: string | null | undefined;
  avatarUrl?: string | null;
  size?: UserAvatarSize;
  /** "neutral" is for users without an identity (for example "Deleted user"): no initials, no color. */
  variant?: "default" | "neutral";
  className?: string;
}

const SIZE_CLASSES: Record<UserAvatarSize, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-24 w-24 text-2xl",
};

export function getInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0];
  if (words.length === 1) return first.toUpperCase();
  const last = Array.from(words[words.length - 1])[0];
  return (first + last).toUpperCase();
}

export function UserAvatar({
  name,
  avatarUrl,
  size = "md",
  variant = "default",
  className,
}: UserAvatarProps) {
  const neutral = variant === "neutral";
  return (
    <Avatar
      role="img"
      aria-label={name || "Unknown user"}
      className={cn(SIZE_CLASSES[size], className)}
    >
      {!neutral && avatarUrl ? (
        <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback
        className={cn(
          "font-medium",
          neutral
            ? "bg-muted text-muted-foreground"
            : `bg-transparent ${avatarTone(name)} text-white`
        )}
      >
        {neutral ? <User className="h-1/2 w-1/2" aria-hidden="true" /> : getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
