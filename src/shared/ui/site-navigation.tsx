"use client";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShortlistNavLink } from "@/domains/locations/components/shortlist-nav-link";
import { AuthNavigation } from "@/domains/users/components/auth-navigation";
export function SiteNavigation() {
  const pathname = usePathname();
  return (
    <div className="flex min-w-0 items-center gap-1 sm:gap-2">
      <Link href="/search" className="scene-nav-link" aria-current={pathname === "/search" ? "page" : undefined} aria-label="장소 찾기">
        <Search size={17} aria-hidden="true" />
        <span className="hidden sm:inline">장소 찾기</span>
      </Link>
      <ShortlistNavLink />
      <AuthNavigation />
    </div>
  );
}
