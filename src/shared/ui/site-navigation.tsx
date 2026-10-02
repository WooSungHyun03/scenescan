"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShortlistNavLink } from "@/domains/locations/components/shortlist-nav-link";
export function SiteNavigation() {
  const pathname = usePathname();
  return <div className="flex min-w-0 items-center gap-1 sm:gap-3"><Link href="/search" className="scene-nav-link" aria-current={pathname === "/search" ? "page" : undefined}>장소 찾기</Link><ShortlistNavLink /></div>;
}
