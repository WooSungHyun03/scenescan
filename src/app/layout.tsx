import type { Metadata } from "next";
import Link from "next/link";
import { ShortlistNavLink } from "@/domains/locations/components/shortlist-nav-link";
import { SkipLink } from "@/shared/ui/skip-link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SceneScan",
  description: "레퍼런스 이미지로 촬영 장소를 탐색하는 오픈소스 프로젝트",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <SkipLink targetId="main-content" />
        <header className="border-b border-stone-200 bg-white">
          <nav
            className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-5"
            aria-label="주 메뉴"
          >
            <Link
              href="/"
              className="inline-flex min-h-11 shrink-0 items-center rounded-md px-1 text-lg font-bold tracking-tight text-emerald-900 sm:text-xl"
              aria-label="SceneScan 홈"
            >
              SceneScan<span className="text-amber-600" aria-hidden="true">.</span>
            </Link>
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <Link
                href="/search"
                className="inline-flex min-h-11 items-center rounded-md px-1.5 py-2 text-sm font-semibold text-stone-700 hover:text-emerald-800 sm:px-2"
              >
                장소 검색
              </Link>
              <ShortlistNavLink />
            </div>
          </nav>
        </header>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-stone-500">
          SceneScan · 오픈소스 촬영 로케이션 탐색
        </footer>
      </body>
    </html>
  );
}
