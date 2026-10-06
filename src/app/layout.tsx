import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { ShortlistProvider } from "@/domains/locations/components/shortlist-provider";
import { Brand } from "@/shared/ui/brand";
import { SiteNavigation } from "@/shared/ui/site-navigation";
import { SkipLink } from "@/shared/ui/skip-link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SceneScan — 이미지로 촬영 장소 찾기", template: "%s | SceneScan" },
  description: "원하는 장면의 사진을 올리고 비슷한 촬영 장소를 찾아보세요. 장소 사진, 지도, 빛의 방향과 촬영 조건을 함께 비교합니다.",
  icons: { icon: "/icon.svg", apple: "/brand/app-icon.svg" },
};
export const viewport: Viewport = { themeColor: "#185b4b" };
const pretendard = localFont({ src: "../../public/fonts/PretendardVariable.woff2", variable: "--font-pretendard", weight: "100 900", display: "swap" });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <ShortlistProvider>
          <SkipLink targetId="main-content" />
          <header className="scene-site-header">
            <nav
              className="scene-container flex min-h-[var(--header-height)] items-center justify-between gap-2"
              aria-label="주 메뉴"
            >
              <Link
                href="/"
                className="inline-flex min-h-11 shrink-0 items-center rounded-md"
                aria-label="SceneScan 홈"
              >
                <Brand />
              </Link>
              <SiteNavigation />
            </nav>
          </header>
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
          <footer className="mt-16 border-t border-line bg-white sm:mt-24">
            <div className="scene-container grid gap-6 py-9 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <Link href="/" className="inline-flex min-h-11 items-center rounded-lg" aria-label="SceneScan 홈">
                  <Brand />
                </Link>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                  사진에서 출발해 위치, 빛, 촬영 조건을 한곳에서 비교하는 로케이션 헌팅 도구입니다.
                </p>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-muted sm:text-right">
                촬영 허가와 시설 이용 조건은 방문 전에 반드시 운영기관에 확인해 주세요.
              </p>
            </div>
          </footer>
        </ShortlistProvider>
      </body>
    </html>
  );
}
