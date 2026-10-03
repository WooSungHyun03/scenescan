import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
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
        <SkipLink targetId="main-content" />
        <header className="sticky top-0 z-40 border-b border-line bg-white">
          <nav
            className="scene-container flex min-h-18 items-center justify-between gap-2 py-3"
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
        <footer className="mt-12 border-t border-line bg-white">
          <div className="scene-container flex flex-col justify-between gap-5 py-8 sm:flex-row sm:items-center">
            <Link href="/" aria-label="SceneScan 홈"><Brand /></Link>
            <div className="max-w-xl text-sm text-muted"><p>장면을 찾는 시작, SceneScan.</p><p className="mt-1">촬영 허가와 이용 조건은 방문 전 운영기관에 확인해 주세요.</p></div>
          </div>
        </footer>
      </body>
    </html>
  );
}
