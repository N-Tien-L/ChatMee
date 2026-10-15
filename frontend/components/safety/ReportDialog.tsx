"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { reportApi } from "@/lib/api/reportApi";
import { ReportReason, ReportTargetType } from "@/lib/types";

/** Longest note the server accepts (SPEC-009 AC-009-20). */
export const REPORT_NOTE_MAX = 500;

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam" },
  { value: "HARASSMENT", label: "Harassment" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "OTHER", label: "Something else" },
];

const TARGET_NOUN: Record<ReportTargetType, string> = { USER: "person", MESSAGE: "message", ROOM: "room" };

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** Shown in the title, for example the person's or room's name. */
  label?: string;
}

interface ReportDialogProps {
  target: ReportTarget | null;
  onClose: () => void;
}

/**
 * Report a user, message or room (SPEC-009 AC-009-20). The server answers 202 with nothing to show, so the only
 * result is a thank-you toast; nobody else sees a change.
 */
export function ReportDialog({ target, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Every close goes through here, so the next report starts empty.
  const close = () => {
    setReason(null);
    setNote("");
    onClose();
  };

  const tooLong = note.length > REPORT_NOTE_MAX;
  const valid = reason !== null && !tooLong;
  const noun = target ? TARGET_NOUN[target.type] : "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target || !reason || !valid || submitting) return;
    setSubmitting(true);
    try {
      const trimmed = note.trim();
      await reportApi.create({
        targetType: target.type,
        targetId: target.id,
        reason,
        ...(trimmed ? { note: trimmed } : {}),
      });
      toast.success("Thanks. Your report was sent.");
      close();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Could not send the report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              Report {target?.label ? `${target.label}` : `this ${noun}`}
            </DialogTitle>
            <DialogDescription>
              Reports are private. The {noun} is not told who reported it.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Reason</legend>
            {REASONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  className="accent-primary"
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="report-note">Note (optional)</Label>
            <textarea
              id="report-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-invalid={tooLong}
              aria-describedby="report-note-count"
              className="min-h-[80px] w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-destructive"
            />
            <p
              id="report-note-count"
              className={`text-right font-mono text-xs tabular ${tooLong ? "text-destructive" : "text-muted-foreground"}`}
            >
              {tooLong ? `Keep the note to ${REPORT_NOTE_MAX} characters. ` : ""}
              {note.length} / {REPORT_NOTE_MAX}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!valid || submitting}>
              Send report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
