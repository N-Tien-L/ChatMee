"use client";

import dynamic from "next/dynamic";

const ConstellationGrid = dynamic(() => import("@/components/fx/constellation-grid"), { ssr: false });

/**
 * One background for the whole public page: the constellation mesh is pinned to the viewport, so it never ends at a
 * section edge and the content scrolls over it (a natural depth cue). A soft vignette keeps text areas calm.
 * Section glows live in the page and scroll with the content, so the mood shifts gradually from teal to ember.
 */
export function PageBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <ConstellationGrid className="absolute inset-0 opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_90%_at_50%_45%,transparent_35%,var(--background)_100%)]" />
    </div>
  );
}
