"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";

interface ReactionSurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}

/** A Dialog on desktop and a bottom drawer on mobile (SPEC-015 AC-015-10), for the picker and who-reacted list. */
export function ReactionSurface({ open, onOpenChange, title, description, children }: ReactionSurfaceProps) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-2xl p-0">
          <div className="px-5 pt-5 pb-3">
            <SheetTitle className="font-display text-lg font-semibold">{title}</SheetTitle>
            <SheetDescription className="sr-only">{description}</SheetDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-2xl p-0 sm:max-w-[400px]">
        <div className="px-5 pt-5 pb-3">
          <DialogTitle className="font-display text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </div>
        <div className="px-4 pb-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
