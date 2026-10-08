"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, MapPinned } from "lucide-react";
import { publicEnv } from "@/env/public";
import {
  createKakaoMapAdapter,
  mockMapAdapter,
  type MapMarkerController,
} from "@/domains/locations/services/map-adapter";
import type { LocationSearchResult } from "@/types/domain";
import { getLocationAreaLabel } from "@/domains/locations/components/location-copy";

type SearchResultsMapProps = {
  results: LocationSearchResult[];
  activeLocationId: string | null;
  onMarkerActivate: (locationId: string) => void;
};

export function SearchResultsMap({
  results,
  activeLocationId,
  onMarkerActivate,
}: SearchResultsMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapMarkerController | null>(null);
  const activateRef = useRef(onMarkerActivate);
  const activeLocationRef = useRef(activeLocationId);
  const [error, setError] = useState<string | null>(null);
  const markers = useMemo(
    () =>
      results
        .map(({ location }, index) => ({
          id: location.id,
          label: location.name,
          point: location.point,
          rank: index + 1,
        }))
        .filter(
          ({ point }) =>
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude) &&
            point.latitude >= -90 &&
            point.latitude <= 90 &&
            point.longitude >= -180 &&
            point.longitude <= 180,
        ),
    [results],
  );

  useEffect(() => {
    activateRef.current = onMarkerActivate;
  }, [onMarkerActivate]);

  useEffect(() => {
    activeLocationRef.current = activeLocationId;
  }, [activeLocationId]);

  useEffect(() => {
    const element = mapElementRef.current;
    if (!element || markers.length === 0) return;

    let disposed = false;
    const key = publicEnv.kakaoMapKey;
    const adapter = key ? createKakaoMapAdapter(key) : mockMapAdapter;

    adapter
      .mountMarkers(element, markers, {
        activeMarkerId: activeLocationRef.current,
        onMarkerActivate: (markerId) => activateRef.current(markerId),
      })
      .then((controller) => {
        if (disposed) {
          controller.destroy();
          return;
        }
        controllerRef.current = controller;
        controller.setActiveMarker(activeLocationRef.current);
        setError(null);
      })
      .catch(async () => {
        if (disposed) return;
        const fallbackController = await mockMapAdapter.mountMarkers(element, markers, {
          activeMarkerId: activeLocationRef.current,
          onMarkerActivate: (markerId) => activateRef.current(markerId),
        });
        if (disposed) {
          fallbackController.destroy();
          return;
        }
        controllerRef.current = fallbackController;
        fallbackController.setActiveMarker(activeLocationRef.current);
        setError("지도를 불러오지 못했습니다. 위치 미리보기를 참고해 주세요.");
      });

    return () => {
      disposed = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [markers]);

  useEffect(() => {
    controllerRef.current?.setActiveMarker(activeLocationId);
  }, [activeLocationId]);

  const activeResult = results.find(
    ({ location }) => location.id === activeLocationId,
  );

  return (
    <section
      aria-labelledby="search-results-map-title"
      className="scene-panel overflow-hidden p-4"
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3
            id="search-results-map-title"
            className="flex items-center gap-2 font-semibold"
          >
            <MapPinned size={18} aria-hidden="true" />
            검색 결과 지도
          </h3>
          <p className="mt-1 text-xs text-stone-500">
            지도 위 번호를 선택하면 해당 장소 사진을 확인할 수 있습니다.
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-stone-500">
          {markers.length}곳
        </span>
      </div>
      {markers.length > 0 ? (
        <div
          ref={mapElementRef}
          role="region"
          aria-label="검색 결과 장소 분포 지도"
          className="h-72 overflow-hidden rounded-lg bg-emerald-50 text-sm text-emerald-950 sm:h-80"
        />
      ) : (
        <div
          role="status"
          className="flex h-72 items-center justify-center rounded-lg bg-stone-100 px-6 text-center text-sm text-stone-600 sm:h-80"
        >
          표시할 수 있는 위치 좌표가 없습니다.
        </div>
      )}
      {markers.length > 0 && (
        <ul
          aria-label="지도 마커 키보드 선택"
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          {markers.map((marker) => {
            const isActive = marker.id === activeLocationId;
            return (
              <li key={marker.id} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onMarkerActivate(marker.id)}
                  onFocus={() => onMarkerActivate(marker.id)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold ${
                    isActive
                      ? "border-emerald-800 bg-emerald-800 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-emerald-700"
                  }`}
                >
                  {isActive ? <Check size={14} aria-hidden="true" /> : <MapPin size={14} aria-hidden="true" />}
                  {marker.rank}. {marker.label}
                  {isActive && <span className="sr-only"> 선택됨</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-stone-600">
        {activeResult
          ? `${activeResult.location.name} · ${getLocationAreaLabel(activeResult.location.district)}`
          : "카드 또는 마커를 선택하면 해당 장소가 강조됩니다."}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {markers.length < results.length && (
        <p className="mt-2 text-xs text-amber-800">
          좌표가 올바르지 않은 {results.length - markers.length}개 결과는 지도에서
          제외했습니다.
        </p>
      )}
    </section>
  );
}
