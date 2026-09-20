import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SceneScan",
  description: "레퍼런스 이미지로 촬영 장소를 탐색하는 오픈소스 프로젝트",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>
    <header className="border-b border-stone-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4" aria-label="주 메뉴">
        <Link href="/" className="text-xl font-bold tracking-tight text-emerald-900">SceneScan<span className="text-amber-600">.</span></Link>
        <Link href="/search" className="text-sm font-semibold text-stone-700 hover:text-emerald-800">장소 검색</Link>
      </nav>
    </header>
    {children}
    <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-stone-500">SceneScan · 오픈소스 촬영 로케이션 탐색</footer>
  </body></html>;
}
