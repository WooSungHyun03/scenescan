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
  const location = await getLocation(id);
  if (!location) notFound();
  const similar = await getSimilarLocations(id);
  return <main className="mx-auto max-w-6xl px-5 py-10">
    <Link href="/search" className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-emerald-800"><ArrowLeft size={16} aria-hidden="true" /> 검색으로 돌아가기</Link>
    <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
      <div className="min-w-0 space-y-8">
        <LocationImageGallery
          images={location.images}
          locationName={location.name}
        />
        <section aria-labelledby="location-overview-title" className="scene-panel p-6">
          <p className="scene-label">{displayValue(location.region)} · {categoryLabels[location.category] ?? "정보 없음"}</p>
          <div className="mt-2 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <h1 id="location-overview-title" className="text-3xl font-bold sm:text-4xl">{displayValue(location.name)}</h1>
            <ShortlistButton
              locationId={location.id}
              locationName={location.name}
            />
          </div>
          <p className={`mt-4 leading-relaxed ${location.description.trim() ? "text-stone-600" : "text-stone-500"}`}>{displayValue(location.description)}</p>
          <div className="mt-5 flex items-start gap-2 border-t border-stone-200 pt-5 text-sm text-stone-700"><MapPin size={17} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{displayValue(location.address)}</span></div>
        </section>
        <section aria-labelledby="source-title" className="scene-panel p-6">
          <h2 id="source-title" className="text-xl font-semibold">장소 데이터 출처</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            장소 설명·주소·이미지·허가 정보의 등록 원문을 확인할 수 있습니다.
          </p>
          <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
            <SourceAttribution
              source={location.source}
              sourceUrl={location.sourceUrl}
              author={location.author}
              license={location.license}
              licenseUrl={location.licenseUrl}
              lastVerifiedAt={location.lastVerifiedAt}
              label="장소 데이터 출처"
              showLabel={false}
              showDetails
            />
          </div>
        </section>
      </div>
      <div className="space-y-5">
        <section aria-labelledby="map-title" className="scene-panel p-5"><h2 id="map-title" className="mb-4 text-lg font-semibold">지도</h2><LocationMap point={location.point} label={displayValue(location.name)} /><p className="mt-3 text-xs text-stone-500">위도 {location.point.latitude.toFixed(5)} · 경도 {location.point.longitude.toFixed(5)}</p></section>
        <section aria-labelledby="solar-title" className="scene-panel p-5"><h2 id="solar-title" className="mb-4 text-lg font-semibold">태양 위치</h2><SolarPanel point={location.point} /></section>
        <PermitInfoPanel permit={location.permit} sourceUrl={location.sourceUrl} />
        <ParkingInfoPanel
          parking={location.parking}
          origin={location.point}
          locationId={location.id}
        />
        <NoiseSourcePanel noiseSources={location.noiseSources} />
      </div>
    </div>
    <SimilarLocationsSection locationId={location.id} initialResults={similar} />
  </main>;
}
