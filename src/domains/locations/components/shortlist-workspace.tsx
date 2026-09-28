"use client";

import Link from "next/link";
import { ArrowRight, Heart, ImagePlus, MapPin } from "lucide-react";
import { LocationCard } from "@/domains/locations/components/location-card";
import { useShortlist } from "@/domains/locations/components/use-shortlist";
import type { Location } from "@/types/domain";

const categoryLabels: Record<Location["category"], string> = {
  urban: "도시",
  nature: "자연",
  industrial: "산업",
  interior: "실내",
};

function displayValue(value: string | null | undefined) {
  return value?.trim() || "정보 없음";
}

function ShortlistSkeleton() {
  return (
    <div role="status" aria-label="관심 장소를 불러오는 중">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="scene-panel overflow-hidden" aria-hidden="true">
            <div className="aspect-[4/3] animate-pulse bg-stone-200" />
            <div className="space-y-3 p-4">
              <div className="h-5 w-2/3 animate-pulse rounded bg-stone-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-stone-100" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">저장된 관심 장소를 불러오고 있습니다.</span>
    </div>
  );
}

function ComparisonTable({ locations }: { locations: Location[] }) {
  const rows = [
    {
      label: "지역",
      value: (location: Location) => displayValue(location.region),
    },
    {
      label: "공간 유형",
      value: (location: Location) => categoryLabels[location.category],
    },
    {
      label: "주소",
      value: (location: Location) => displayValue(location.address),
    },
    {
      label: "허가 문의 유형",
      value: (location: Location) => displayValue(location.permit.type),
    },
    {
      label: "등록 주차 정보",
      value: (location: Location) =>
        location.parking.length ? `${location.parking.length}곳` : "정보 없음",
    },
    {
      label: "예상 소음원",
      value: (location: Location) =>
        location.noiseSources.length
          ? `${location.noiseSources.length}개`
          : "정보 없음",
    },
  ];

  return (
    <section className="mt-10" aria-labelledby="comparison-title">
      <div className="mb-4">
        <p className="scene-label">COMPARE</p>
        <h2 id="comparison-title" className="mt-1 text-2xl font-bold">
          후보 비교
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          저장한 장소의 기본 촬영 조건을 나란히 확인하세요.
        </p>
      </div>

      <div className="scene-panel overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <caption className="sr-only">저장된 촬영 후보 비교표</caption>
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th scope="col" className="sticky left-0 z-10 w-40 bg-stone-50 p-4 font-semibold text-stone-600">
                비교 항목
              </th>
              {locations.map((location) => (
                <th key={location.id} scope="col" className="min-w-56 p-4">
                  <Link
                    href={`/locations/${location.id}`}
                    className="font-bold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
                  >
                    {displayValue(location.name)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-stone-100 last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white p-4 font-semibold text-stone-600"
                >
                  {row.label}
                </th>
                {locations.map((location) => {
                  const value = row.value(location);
                  return (
                    <td
                      key={location.id}
                      className={`max-w-72 p-4 align-top leading-relaxed ${
                        value === "정보 없음" ? "text-stone-500" : "text-stone-800"
                      }`}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ShortlistWorkspace({ locations }: { locations: Location[] }) {
  const { ids, count, isReady, error } = useShortlist();
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const savedLocations = ids.flatMap((id) => {
    const location = locationsById.get(id);
    return location ? [location] : [];
  });
  const unavailableCount = count - savedLocations.length;

  if (!isReady) return <ShortlistSkeleton />;

  return (
    <div>
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {savedLocations.length ? (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-600">
              이 브라우저에 촬영 후보 <strong className="text-stone-900">{savedLocations.length}곳</strong>이 저장되어 있습니다.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:text-emerald-950"
            >
              후보 더 찾기 <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          {unavailableCount > 0 && (
            <p className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              저장된 ID 중 현재 데이터에서 찾을 수 없는 장소가 {unavailableCount}곳 있습니다.
            </p>
          )}

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {savedLocations.map((location) => (
              <LocationCard key={location.id} location={location} />
            ))}
          </div>

          <ComparisonTable locations={savedLocations} />
        </>
      ) : (
        <div className="scene-panel px-6 py-14 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-rose-50 text-rose-700">
            <Heart size={26} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-bold">저장한 관심 장소가 없습니다.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-600">
            검색 결과나 장소 상세 화면의 하트 버튼을 눌러 촬영 후보를 저장하고
            비교해 보세요.
          </p>
          <Link
            href="/search"
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          >
            <ImagePlus size={17} aria-hidden="true" />
            장소 검색하기
          </Link>
        </div>
      )}

      <div className="mt-8 flex items-start gap-2 rounded-lg bg-stone-100 p-3 text-xs leading-relaxed text-stone-600">
        <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          관심 장소 ID는 로그인이나 서버 저장 없이 현재 브라우저에만 보관됩니다.
          브라우저 데이터를 삭제하면 목록도 함께 삭제됩니다.
        </p>
      </div>
    </div>
  );
}
