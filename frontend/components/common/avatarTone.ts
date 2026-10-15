const TONES = 7;

/** A stable identity tone class (`tone-0`..`tone-6`, defined in globals.css) for a name. */
export function avatarTone(name: string | null | undefined): string {
  let hash = 0;
  for (const char of name ?? "") {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return `tone-${hash % TONES}`;
}
