import type { ReactNode } from "react";

interface RevealHeadingProps {
  as?: "h2" | "h3";
  /** One entry per visual line; words reveal one after another as the heading scrolls into view. */
  lines: string[];
  id?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Section heading whose words rise in on scroll (CSS scroll-driven animation, `.reveal-words` in globals.css).
 * Pure CSS: the words are plain text, so they read normally to screen readers and stay visible without JavaScript,
 * in browsers without scroll timelines, and under reduced motion.
 */
export function RevealHeading({ as: Tag = "h2", lines, id, className = "" }: RevealHeadingProps) {
  let index = 0;
  return (
    <Tag id={id} className={`reveal-words ${className}`}>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex} className="block">
          {line.split(" ").map((word, wordIndex) => (
            <span key={wordIndex} style={{ "--i": index++ } as React.CSSProperties}>
              {word}
              {wordIndex < line.split(" ").length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}
