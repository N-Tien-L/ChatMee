"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import StarBorder from "@/components/fx/star-border";

/** The landing's one primary action: a link to sign-in wrapped in the React Bits star border. */
export function StartCta({ label = "Start chatting free" }: { label?: string }) {
  return (
    <StarBorder
      as={Link}
      href="/login"
      theme="dark"
      color="#2ee6c1"
      trailColor="#ff6a3d"
      radius={14}
      backgroundColor="#2ee6c1"
      textColor="#03201b"
      className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold"
    >
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </StarBorder>
  );
}
