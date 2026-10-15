import { cn } from "@/lib/utils";
import { avatarTone } from "./avatarTone";

interface RoomCoverProps {
  /** Room name: the cover's colour is derived from it, so every room keeps its own (D-16). */
  name: string;
  className?: string;
}

/** A room's identity band: its tone gradient with a soft light and a fine dot texture. Decorative. */
export function RoomCover({ name, className }: RoomCoverProps) {
  return (
    <div aria-hidden="true" className={cn("relative overflow-hidden", avatarTone(name), className)}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_120%_at_85%_0%,rgb(255_255_255/0.35),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.22)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
    </div>
  );
}
