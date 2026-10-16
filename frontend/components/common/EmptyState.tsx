import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Ripple } from "@/components/fx/ripple";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 py-8 text-center",
        className
      )}
    >
      {icon ? (
        <div className="relative mb-2 grid h-24 w-24 place-items-center" aria-hidden="true">
          <Ripple mainCircleSize={90} mainCircleOpacity={0.18} numCircles={4} />
          <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-bubble-own-from to-bubble-own-to text-primary-foreground shadow-[0_12px_30px_-10px_rgb(11_107_93/0.6)] [&_svg]:h-7 [&_svg]:w-7">
            {icon}
          </div>
        </div>
      ) : null}
      <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
