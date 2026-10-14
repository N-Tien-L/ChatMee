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
        "inline-flex min-w-5 items-center justify-center rounded-full bg-spot px-1.5 font-mono text-[11px] font-semibold leading-5 tabular text-spot-foreground",
        className
      )}
    >
      {count > MAX_COUNT ? `${MAX_COUNT}+` : count}
    </span>
  );
}
