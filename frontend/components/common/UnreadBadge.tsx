import { cn } from "@/lib/utils";

const MAX_COUNT = 99;

interface UnreadBadgeProps {
  count: number;
  className?: string;
}

export function UnreadBadge({ count, className }: UnreadBadgeProps) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread messages`}
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-5 text-primary-foreground",
        className
      )}
    >
      {count > MAX_COUNT ? `${MAX_COUNT}+` : count}
    </span>
  );
}
