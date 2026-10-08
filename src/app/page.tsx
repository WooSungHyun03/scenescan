import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, MapPin } from "lucide-react";
import { publicEnv } from "@/env/public";
import { LocationCard } from "@/domains/locations/components/location-card";
import { getLocationAreaLabel } from "@/domains/locations/components/location-copy";
import { getLocations } from "@/domains/locations/server/repository";
import { ImageSearchEntry } from "@/domains/search/components/image-search-entry";

export const dynamic = "force-dynamic";

const steps = [
  ["사진 한 장으로 시작", "찾고 싶은 분위기와 구도가 담긴 참고 이미지를 선택하세요."],
  ["후보를 한눈에 비교", "비슷한 장소 최대 8곳을 사진, 위치, 유사도와 함께 살펴보세요."],
  ["촬영 조건까지 확인", "빛의 방향과 허가·주차 정보를 확인하고 후보를 저장하세요."],
] as const;

export default async function HomePage() {
  const pages = await Promise.all((["nature", "urban", "industrial", "interior"] as const).map((category) => getLocations({ category, limit: 4 })));
  const examples = pages.flatMap((locations) => {
    const location = locations.find((item) => item.images.length > 0);
    return location ? [location] : [];
  });
  const hero = examples[0];
  const mock = publicEnv.useMockData;

  return (
    <main>
      <section className="border-b border-line bg-white">
        <div className="scene-container grid items-center gap-10 py-10 md:grid-cols-[minmax(0,1.02fr)_minmax(340px,.98fr)] md:py-16 lg:gap-16 lg:py-20">
          <div className="min-w-0">
            <p className="scene-kicker">Location scouting</p>
            <h1 className="mt-4 max-w-3xl text-[2.45rem] font-extrabold leading-[1.12] tracking-[-.06em] sm:text-5xl lg:text-[3.75rem]">
              원하는 장면을 올리면,
              <span className="block text-brand">비슷한 장소를 찾아드려요.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              마음에 둔 사진 한 장으로 촬영 후보를 좁히고, 장소 사진부터 위치와 빛의 방향까지 한 흐름에서 비교하세요.
            </p>
            <ImageSearchEntry />
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-stone-600" aria-label="서비스 특징">
              <span className="inline-flex items-center gap-2"><Check size={16} className="text-brand" aria-hidden="true" />최대 8곳 비교</span>
              <span className="inline-flex items-center gap-2"><Check size={16} className="text-brand" aria-hidden="true" />지도·태양 방향 확인</span>
              <span className="inline-flex items-center gap-2"><Check size={16} className="text-brand" aria-hidden="true" />관심 장소 저장</span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              {mock
                ? "현재 화면은 등록된 샘플 장소를 사용해 전체 검색 흐름을 체험할 수 있습니다."
                : "선택한 사진은 기기에서 분석하며 장소 검색 외의 용도로 저장하지 않습니다."}
            </p>
          </div>

          {hero && (
            <div className="scene-panel overflow-hidden border-stone-300 shadow-[var(--shadow-raised)]">
              <Link href={`/locations/${hero.id}`} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden bg-stone-200">
                  <Image
                    src={hero.images[0].imageUrl}
                    alt={hero.images[0].alt || hero.name}
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none"
                  />
                  <span className="absolute left-4 top-4 rounded-full bg-stone-950/85 px-3 py-1.5 text-xs font-bold text-white">
                    추천 로케이션
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 bg-white px-5 py-4 sm:px-6 sm:py-5">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{hero.name}</p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                      <MapPin size={15} aria-hidden="true" />
                      {getLocationAreaLabel(hero.district)} · 촬영 정보 보기
                    </p>
                  </div>
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                    <ArrowRight size={19} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="scene-container py-10 sm:py-14" aria-labelledby="how-it-works-title">
        <div className="mb-7 max-w-2xl">
          <p className="scene-kicker">How it works</p>
          <h2 id="how-it-works-title" className="mt-3 text-2xl font-extrabold sm:text-3xl">장소 탐색부터 촬영 검토까지</h2>
        </div>
        <ol className="scene-grid grid gap-4 md:grid-cols-3">
          {steps.map(([title, description], index) => (
            <li key={title} className="scene-panel flex gap-4 p-5 sm:p-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-extrabold tabular-nums text-white" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3 className="text-base font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="scene-container border-t border-line py-10 sm:py-16" aria-labelledby="featured-locations-title">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="scene-kicker">Explore</p>
            <h2 id="featured-locations-title" className="mt-3 text-2xl font-extrabold sm:text-3xl">
              {mock ? "예시 장소 둘러보기" : "이런 촬영 장소는 어떠세요?"}
            </h2>
            <p className="mt-2 text-sm text-muted">사진을 선택하기 전에 다양한 공간과 촬영 조건을 살펴보세요.</p>
          </div>
          <Link href="/search" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-brand hover:bg-brand-soft">
            전체 장소
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="scene-grid grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {examples.map((location) => <LocationCard key={location.id} location={location} />)}
        </div>
      </section>
    </main>
  );
}
