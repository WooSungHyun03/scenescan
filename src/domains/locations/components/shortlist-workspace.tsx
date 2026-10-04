"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Heart, ImagePlus, MapPin, Scale } from "lucide-react";
import { LocationCard } from "@/domains/locations/components/location-card";
import { ShortlistComparison } from "@/domains/locations/components/shortlist-comparison";
import { useShortlist } from "@/domains/locations/components/use-shortlist";
import type { Location } from "@/types/domain";
import { locationIdSchema } from "@/types/contracts";

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

function ShortlistReadyContent({
  savedLocations,
  unavailableCount,
}: {
  savedLocations: Location[];
  unavailableCount: number;
}) {
  const [selectedIds, setSelectedIds] = useState(() =>
    savedLocations.slice(0, 4).map((location) => location.id),
  );
  const availableIds = new Set(savedLocations.map((location) => location.id));
  const normalizedSelectedIds = selectedIds.filter((id) => availableIds.has(id));
  const selectedIdSet = new Set(normalizedSelectedIds);
  const selectedLocations = savedLocations.filter((location) =>
    selectedIdSet.has(location.id),
  );

  function toggleComparison(locationId: string) {
    setSelectedIds((current) => {
      const availableCurrent = current.filter((id) => availableIds.has(id));
      if (availableCurrent.includes(locationId)) {
        return availableCurrent.filter((id) => id !== locationId);
      }
      if (availableCurrent.length >= 4) return availableCurrent;
      return [...availableCurrent, locationId];
    });
  }

  return (
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

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-950">
        <Scale size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          아래 후보 중 비교할 장소를 2~4곳 선택하세요. 현재 <strong>{selectedLocations.length}곳</strong>이 선택되어 있습니다.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {savedLocations.map((location, index) => {
          const isSelected = selectedIdSet.has(location.id);
          const isDisabled = !isSelected && selectedLocations.length >= 4;
          return (
            <div key={location.id} className="space-y-2">
              <LocationCard location={location} eager={index < 4} />
              <label
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                  isSelected
                    ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                    : isDisabled
                      ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400"
                      : "cursor-pointer border-stone-300 bg-white text-stone-700 hover:border-emerald-500"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => toggleComparison(location.id)}
                  className="size-4 accent-emerald-700"
                />
                {isSelected ? "비교 선택됨" : isDisabled ? "최대 4곳 선택 가능" : "비교에 추가"}
              </label>
            </div>
          );
        })}
      </div>

      <ShortlistComparison locations={selectedLocations} />
    </>
  );
}

export function ShortlistWorkspace() {
  const { ids, count, isReady, error } = useShortlist();
  const key = JSON.stringify(ids);
  const [loaded, setLoaded] = useState<{ key: string; locations: Location[]; error?: string }>({ key: "", locations: [] });
  useEffect(() => {
    if (!isReady) return;
    const controller = new AbortController();
    // Legacy/deleted IDs remain in storage, but must not poison an entire
    // valid ID batch with a 400. They are reported as unavailable below.
    const selectedIds = (JSON.parse(key) as string[]).filter((id) => locationIdSchema.safeParse(id).success);
    const load = async () => {
      const locations: Location[] = [];
      for (let index = 0; index < selectedIds.length; index += 50) {
        const params = new URLSearchParams(selectedIds.slice(index, index + 50).map((id) => ["id", id]));
        const response = await fetch(`/api/locations?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw new Error("관심 장소를 불러오지 못했습니다. 잠시 후 페이지를 다시 열어 주세요.");
        const data = await response.json();
        if (!Array.isArray(data.locations)) throw new Error("장소 응답을 확인할 수 없습니다.");
        locations.push(...data.locations);
      }
      if (!controller.signal.aborted) setLoaded({ key, locations });
    };
    void load().catch((cause: unknown) => {
      if (!controller.signal.aborted) setLoaded({ key, locations: [], error: cause instanceof Error ? cause.message : "관심 장소 조회에 실패했습니다." });
    });
    return () => controller.abort();
  }, [key, isReady]);
  const locations = loaded.locations;
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const savedLocations = ids.flatMap((id) => {
    const location = locationsById.get(id);
    return location ? [location] : [];
  });
  const unavailableCount = count - savedLocations.length;

  if (!isReady || loaded.key !== key) return <ShortlistSkeleton />;
  if (loaded.error) return <p role="alert" className="scene-panel p-5">{loaded.error}</p>;

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
        <ShortlistReadyContent
          savedLocations={savedLocations}
          unavailableCount={unavailableCount}
        />
      ) : (
        <div className="scene-panel px-6 py-14 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-rose-50 text-rose-700">
            <Heart size={26} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-bold">저장한 관심 장소가 없습니다.</h2>
          {unavailableCount > 0 && <p className="mt-3 text-sm text-amber-900">이전에 저장한 {unavailableCount}곳은 현재 장소 ID로 확인할 수 없습니다. 새로운 후보를 찾아 저장해 주세요.</p>}
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
