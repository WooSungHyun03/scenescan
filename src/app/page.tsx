import Link from "next/link";
import { ArrowRight, ImagePlus } from "lucide-react";
import { LocationCard } from "@/domains/locations/components/location-card";
import { getLocations } from "@/domains/locations/server/repository";
import { Button } from "@/shared/ui/button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const examples = (await getLocations()).slice(0, 4);
  return <main className="mx-auto max-w-6xl px-5">
    <section className="grid gap-12 py-16 md:grid-cols-[1.2fr_.8fr] md:items-center md:py-24">
      <div><p className="scene-label">LOCATION DISCOVERY FOR FILMMAKERS</p>
        <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">장면에서 시작하는<br /><span className="text-emerald-800">로케이션 탐색</span></h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone-600">레퍼런스 이미지 한 장으로 촬영 장소를 찾아보세요.</p>
        <Button asChild size="lg" className="mt-8"><Link href="/search"><ImagePlus size={18} aria-hidden="true" /> 이미지 업로드 <ArrowRight size={17} aria-hidden="true" /></Link></Button>
      </div>
      <div className="scene-panel p-8"><div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-10 text-center">
        <ImagePlus className="mx-auto mb-4 text-emerald-700" size={36} aria-hidden="true" /><p className="font-semibold">레퍼런스 이미지</p><p className="mt-2 text-sm text-stone-600">이미지를 선택하고 비슷한 장소를 탐색하세요.</p>
      </div></div>
    </section>
    <section className="pb-16"><div className="mb-6 flex items-end justify-between"><div><p className="scene-label">EXPLORE</p><h2 className="mt-2 text-2xl font-bold">예시 장소</h2></div><Link href="/search" className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-emerald-800">모두 보기 →</Link></div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{examples.map((location, index) => <LocationCard key={location.id} location={location} eager={index < 4} />)}</div>
    </section>
  </main>;
}
