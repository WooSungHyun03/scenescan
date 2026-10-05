"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { usePathname } from "next/navigation";
import { useShortlist } from "./use-shortlist";

export function ShortlistNavLink() {
  const { count, isReady } = useShortlist();
  const pathname = usePathname();

  return (
    <Link
      href="/shortlist"
      className="scene-nav-link"
      aria-label="관심 장소"
      aria-current={pathname === "/shortlist" ? "page" : undefined}
    >
      <Heart size={16} aria-hidden="true" />
      <span className="hidden sm:inline">관심 장소</span>
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
