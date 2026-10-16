const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return date.toLocaleDateString();
}

interface RelativeTimeProps {
  value: string | number | Date;
  /** Reference time; defaults to the current time. */
  now?: Date;
  className?: string;
}

export function RelativeTime({ value, now, className }: RelativeTimeProps) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString()}
      className={className}
      suppressHydrationWarning
    >
      {formatRelativeTime(date, now)}
    </time>
  );
}
