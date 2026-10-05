import Link from "next/link";

export default function LocationNotFound() {
  return <main className="scene-container py-16 sm:py-24"><div className="scene-empty mx-auto max-w-2xl"><p className="scene-kicker justify-center">Not found</p><h1 className="mt-3 text-3xl font-extrabold">장소를 찾을 수 없습니다</h1><p className="mt-3 text-muted">삭제되었거나 주소가 변경된 장소일 수 있습니다.</p><Link href="/search" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover">촬영 장소 찾기로 돌아가기</Link></div></main>;
}
