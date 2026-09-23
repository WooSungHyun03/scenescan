import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { LocationCard } from "@/domains/locations/components/location-card";
import { LocationMap } from "@/domains/locations/components/location-map";
import { SolarPanel } from "@/domains/locations/components/solar-panel";
import { getLocation, getSimilarLocations } from "@/domains/locations/server/repository";

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = await getLocation(id);
  if (!location) notFound();
  const similar = await getSimilarLocations(id);
  return <main className="mx-auto max-w-6xl px-5 py-10">
    <Link href="/search" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowLeft size={16} /> 검색으로 돌아가기</Link>
    <div className="mt-7 grid gap-8 lg:grid-cols-[1.4fr_.6fr]">
      <div><div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-stone-200"><Image src={location.images[0]?.imageUrl ?? "/images/placeholder.svg"} alt={location.images[0]?.alt ?? location.name} fill sizes="(max-width: 1024px) 100vw, 65vw" className="object-cover" /></div>
        <p className="scene-label mt-6">{location.region} / {location.category}</p><h1 className="mt-2 text-4xl font-bold">{location.name}</h1><p className="mt-4 leading-relaxed text-stone-600">{location.description}</p>
        <p className="mt-4 flex items-center gap-2 text-sm text-stone-700"><MapPin size={16} />{location.address}</p>
      </div>
      <div className="space-y-5"><section className="scene-panel p-5"><h2 className="mb-4 text-lg font-semibold">지도</h2><LocationMap point={location.point} /></section>
        <section className="scene-panel p-5"><h2 className="mb-4 text-lg font-semibold">태양 위치</h2><SolarPanel point={location.point} /></section>
        <section className="scene-panel p-5"><h2 className="mb-3 text-lg font-semibold">촬영 정보</h2><dl className="space-y-4 text-sm"><div><dt className="scene-label">허가</dt><dd className="mt-1">{location.permit.type}</dd></div><div><dt className="scene-label">담당자</dt><dd className="mt-1">{location.permit.contactName ?? "정보 확인 필요"}</dd></div><div><dt className="scene-label">주차</dt><dd className="mt-1">{location.parking.map((item) => item.name).join(", ") || "정보 없음"}</dd></div><div><dt className="scene-label">소음</dt><dd className="mt-1">{location.noiseSources.map((item) => item.note).join(", ") || "정보 없음"}</dd></div></dl></section>
      </div>
    </div>
    <section className="mt-14"><h2 className="mb-5 text-2xl font-bold">이 장소와 비슷한 곳 더 보기</h2>{similar.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{similar.map(({ location: item }) => <LocationCard key={item.id} location={item} />)}</div> : <p className="text-stone-600">아직 추천 장소가 없습니다.</p>}</section>
  </main>;
}
