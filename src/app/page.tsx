import Link from "next/link";
import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";
import { LocationCard } from "@/domains/locations/components/location-card";
import { getLocations } from "@/domains/locations/server/repository";
import { ImageSearchEntry } from "@/domains/search/components/image-search-entry";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const locations = await getLocations();
  const examples = ["nature", "urban", "industrial", "interior"].flatMap((category) => {
    const location = locations.find((item) => item.category === category && item.images.length > 0);
    return location ? [location] : [];
  });
  const hero = examples[0];
  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";
  return <main className="scene-container">
    <section className="grid items-center gap-8 py-9 md:grid-cols-2 md:gap-12 md:py-16">
      <div>
        <p className="text-sm font-semibold text-brand">사진에서 시작하는 촬영 장소 찾기</p>
        <h1 className="mt-4 max-w-xl text-[34px] font-bold leading-[1.25] tracking-[-.045em] sm:text-5xl">원하는 장면을 올리면,<br className="hidden sm:block" /> 비슷한 장소를 찾아드려요.</h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted sm:text-lg">마음에 둔 사진 한 장으로 촬영 후보를 좁혀보세요. 장소의 사진과 위치, 빛의 방향을 함께 비교할 수 있습니다.</p>
        <ImageSearchEntry />
        <p className="mt-4 text-sm text-muted">{mock ? "현재는 가상 장소로 검색 흐름을 체험하는 예시 화면입니다." : "선택한 사진은 장소를 찾는 데만 사용하며 서버에 저장하지 않습니다."}</p>
      </div>
      {hero && <div className="relative overflow-hidden rounded-lg bg-stone-200">
        <Link href={`/locations/${hero.id}`} className="block" aria-label={`${hero.name} 장소 둘러보기`}>
          <div className="relative aspect-[5/4]"><Image src={hero.images[0].imageUrl} alt={hero.images[0].alt || hero.name} fill priority sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" /></div>
          <div className="flex items-center justify-between gap-4 bg-white px-5 py-4"><div className="min-w-0"><p className="font-semibold">{hero.name}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} aria-hidden="true" />{hero.region}{mock && " · 개발용 예시"}</p></div><ArrowRight size={20} className="shrink-0 text-brand" aria-hidden="true" /></div>
        </Link>
      </div>}
    </section>
    <section className="grid gap-6 border-y border-line py-7 sm:grid-cols-3" aria-label="장소 찾는 방법">
      {[ ["사진 한 장으로 시작", "원하는 분위기의 참고 이미지를 선택하세요."], ["촬영 후보 비교", "비슷한 장소 최대 8곳을 사진과 지도로 살펴보세요."], ["촬영 전 확인", "빛의 방향과 허가·주차 정보를 확인하고 후보를 저장하세요."] ].map(([title, description], index) => <div key={title} className="flex gap-3"><span className="mt-0.5 text-sm font-bold tabular-nums text-brand" aria-hidden="true">{index + 1}</span><div><h2 className="text-base font-semibold">{title}</h2><p className="mt-2 text-sm text-muted">{description}</p></div></div>)}
    </section>
    <section className="py-10 sm:py-14"><div className="mb-6 flex items-end justify-between gap-4"><div><h2 className="text-2xl font-bold">{mock ? "예시 장소 둘러보기" : "이런 촬영 장소는 어떠세요?"}</h2><p className="mt-2 text-sm text-muted">사진을 선택하기 전에 다양한 공간을 살펴보세요.</p></div><Link href="/search" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand hover:underline">장소 보기<ArrowRight size={15} aria-hidden="true" /></Link></div><div className="scene-grid grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{examples.map((location) => <LocationCard key={location.id} location={location} />)}</div></section>
  </main>;
}
