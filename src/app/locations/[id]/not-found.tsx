import Link from "next/link";

export default function LocationNotFound() {
  return <main className="mx-auto max-w-6xl px-5 py-20"><h1 className="text-3xl font-bold">장소를 찾을 수 없습니다.</h1><Link href="/search" className="mt-5 inline-block text-emerald-800 underline">검색으로 돌아가기</Link></main>;
}
