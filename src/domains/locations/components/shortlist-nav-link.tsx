"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useShortlist } from "./use-shortlist";

export function ShortlistNavLink() {
  const { count, isReady } = useShortlist();

  return (
    <Link
      href="/shortlist"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 hover:text-emerald-800"
    >
      <Heart size={16} aria-hidden="true" />
      관심 장소
      {isReady && count > 0 && (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-800 px-1.5 py-0.5 text-[11px] font-bold text-white"
          aria-label={`${count}곳 저장됨`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
