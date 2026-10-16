import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { avatarTone } from "./avatarTone";

interface RoomAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}

export function RoomAvatar({ name, avatarUrl, className }: RoomAvatarProps) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "#";
  return (
    <Avatar className={cn("h-10 w-10 rounded-lg", className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback className={cn("rounded-[inherit] bg-transparent font-display font-semibold text-white", avatarTone(name))}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
