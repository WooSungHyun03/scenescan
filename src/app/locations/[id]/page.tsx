import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { LocationImageGallery } from "@/domains/locations/components/location-image-gallery";
import { LocationMap } from "@/domains/locations/components/location-map";
import { NoiseSourcePanel } from "@/domains/locations/components/noise-source-panel";
import { ParkingInfoPanel } from "@/domains/locations/components/parking-info-panel";
import { PermitInfoPanel } from "@/domains/locations/components/permit-info-panel";
import { SimilarLocationsSection } from "@/domains/locations/components/similar-locations-section";
import { ShortlistButton } from "@/domains/locations/components/shortlist-button";
import { SolarPanel } from "@/domains/locations/components/solar-panel";
import { SourceAttribution } from "@/domains/locations/components/source-attribution";
import { getLocation, getSimilarLocations } from "@/domains/locations/server/repository";
import { getKoreanDescription } from "@/domains/locations/components/location-copy";
import { locationIdSchema } from "@/types/contracts";
import { logger } from "@/shared/observability/logger";

const categoryLabels = {
  urban: "도시",
  nature: "자연",
  industrial: "산업",
  interior: "실내",
} as const;

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "정보 없음";
}

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!locationIdSchema.safeParse(id).success) notFound();
  const location = await getLocation(id);
  if (!location) notFound();
  // Optional recommendations must never take down photos/map/permit detail.
  let similar: Awaited<ReturnType<typeof getSimilarLocations>> = [];
  let similarUnavailable = false;
  try { similar = await getSimilarLocations(id); }
  catch (error) { similarUnavailable = true; logger.error("Similar locations unavailable", error, { locationId: id }); }
  return <main className="scene-container py-6 sm:py-9">
    <Link href="/search" className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand hover:underline"><ArrowLeft size={16} aria-hidden="true" />촬영 장소 찾기로</Link>
    <div className="mb-6 mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0"><p className="text-sm font-semibold text-brand">{displayValue(location.region)} · {categoryLabels[location.category]}</p><h1 className="mt-2 break-words text-3xl font-bold tracking-tight sm:text-4xl">{displayValue(location.name)}</h1><p className="mt-3 flex items-start gap-2 text-sm text-muted"><MapPin size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{displayValue(location.address)}</p></div>
      <ShortlistButton locationId={location.id} locationName={location.name} />
    </div>
    <nav className="scene-section-nav mb-7" aria-label="장소 상세 바로가기"><a href="#photos">사진</a><a href="#position">위치</a><a href="#lighting">빛의 방향</a><a href="#conditions">촬영 조건</a><a href="#similar">비슷한 장소</a></nav>
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
      <section id="photos" className="min-w-0" aria-label="장소 사진"><LocationImageGallery images={location.images} locationName={location.name} /></section>
      <section aria-labelledby="location-overview-title" className="border-t border-line pt-6 lg:border-t-0 lg:pt-0">
        <h2 id="location-overview-title" className="text-xl font-semibold">이 장소를 살펴보세요</h2>
        <p className="mt-4 leading-relaxed text-muted">{getKoreanDescription(location.description, "한국어로 확인된 장소 설명이 없습니다. 사진과 위치를 참고해 촬영 후보를 검토해 주세요.")}</p>
        <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
          <div className="flex justify-between gap-5 py-4"><dt className="text-muted">공간 종류</dt><dd className="font-semibold">{categoryLabels[location.category]}</dd></div>
          <div className="flex justify-between gap-5 py-4"><dt className="text-muted">촬영 허가</dt><dd className="font-semibold">{location.permit.type.trim() || "사전 확인 필요"}</dd></div>
          <div className="flex justify-between gap-5 py-4"><dt className="text-muted">주차</dt><dd className="text-right font-semibold">{location.parking.length ? `등록 정보 ${location.parking.length}곳` : "확인된 정보 없음"}</dd></div>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-muted">장소 등록이 촬영 허가를 의미하지 않습니다. 일정과 장비가 정해지면 운영기관에 이용 조건을 확인해 주세요.</p>
        <details className="mt-5 border-t border-line pt-3"><summary className="min-h-11 py-2 text-sm font-semibold text-brand">장소 정보 출처 확인</summary><SourceAttribution source={location.source} sourceUrl={location.sourceUrl} author={location.author} license={location.license} licenseUrl={location.licenseUrl} lastVerifiedAt={location.lastVerifiedAt} label="장소 정보 출처" showLabel={false} showDetails />{location.description.trim() && <p className="mt-3 break-words text-sm text-muted"><span className="font-semibold">원문 설명</span> · {location.description}</p>}</details>
      </section>
    </div>
    <div className="scene-section grid gap-8 lg:grid-cols-2">
      <section id="position" aria-labelledby="map-title" className="min-w-0"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="map-title" className="text-xl font-semibold">위치와 이동</h2><a href={`https://map.kakao.com/link/map/${encodeURIComponent(location.name)},${location.point.latitude},${location.point.longitude}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-brand hover:underline" aria-label="카카오맵에서 위치 보기 (새 창)">카카오맵에서 보기</a></div><LocationMap point={location.point} label={displayValue(location.name)} /><p className="mt-3 text-sm text-muted">{displayValue(location.address)}</p></section>
      <section id="lighting" aria-labelledby="solar-title" className="min-w-0"><h2 id="solar-title" className="mb-4 text-xl font-semibold">촬영 시간과 빛의 방향</h2><div className="scene-panel p-5"><SolarPanel point={location.point} /></div></section>
    </div>
    <section id="conditions" className="scene-section" aria-labelledby="conditions-title"><h2 id="conditions-title" className="text-xl font-semibold">촬영 전 확인할 정보</h2><p className="mb-5 mt-2 text-sm text-muted">허가, 차량 이동, 주변 환경을 확인하고 현장 답사로 최종 점검하세요.</p><div className="scene-grid grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3"><PermitInfoPanel permit={location.permit} /><ParkingInfoPanel parking={location.parking} origin={location.point} /><NoiseSourcePanel noiseSources={location.noiseSources} /></div></section>
    <SimilarLocationsSection key={location.id} locationId={location.id} initialResults={similar} initialUnavailable={similarUnavailable} />
  </main>;
}
