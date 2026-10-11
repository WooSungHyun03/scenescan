"use client";

import { useEffect, useRef, useState } from "react";
import { publicEnv } from "@/env/public";
import type { GeoPoint } from "@/types/domain";
import {
  createKakaoMapAdapter,
  mockMapAdapter,
  type MapMarkerController,
  type MapMountController,
} from "@/domains/locations/services/map-adapter";
import { mountLocationMap } from "@/domains/locations/services/location-map-mount";
import { useParkingDiscovery } from "./parking-discovery-context";

const NO_PARKING_CANDIDATES = [] as const;

function isMarkerController(
  controller: MapMountController | MapMarkerController,
): controller is MapMarkerController {
  return "setActiveMarker" in controller
    && typeof controller.setActiveMarker === "function";
}

export function LocationMap({
  point,
  label,
}: {
  point: GeoPoint;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const markerController = useRef<MapMarkerController | null>(null);
  const activeMarkerIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { latitude, longitude } = point;
  const key = publicEnv.kakaoMapKey;
  const parkingDiscovery = useParkingDiscovery();
  const candidates = parkingDiscovery?.candidates ?? NO_PARKING_CANDIDATES;
  const activeMarkerId = parkingDiscovery?.activeCandidateId ?? "location-origin";
  const setActiveCandidateId = parkingDiscovery?.setActiveCandidateId;

  useEffect(() => {
    activeMarkerIdRef.current = activeMarkerId;
    markerController.current?.setActiveMarker(activeMarkerId);
  }, [activeMarkerId]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let disposed = false;
    let controller: MapMountController | MapMarkerController | null = null;
    const adapter = key ? createKakaoMapAdapter(key) : mockMapAdapter;
    const markers = [
      { id: "location-origin", label, point: { latitude, longitude } },
      ...candidates.map((candidate, index) => ({
        id: candidate.id,
        label: candidate.name,
        point: candidate.point,
        rank: index + 1,
      })),
    ];
    const markerOptions = {
      activeMarkerId: activeMarkerIdRef.current,
      onMarkerActivate(markerId: string) {
        setActiveCandidateId?.(markerId === "location-origin" ? null : markerId);
      },
    };

    void mountLocationMap({
      element,
      point: { latitude, longitude },
      label,
      markers,
      markerOptions,
      primary: adapter,
      fallback: mockMapAdapter,
    }).then(({ controller: mountedController, usedFallback }) => {
        if (disposed) {
          mountedController.destroy();
          return;
        }
        controller = mountedController;
        markerController.current = isMarkerController(mountedController)
          ? mountedController
          : null;
        markerController.current?.setActiveMarker(activeMarkerIdRef.current);
        setError(usedFallback && key
          ? "지도를 불러오지 못했습니다. 위치 미리보기와 주소를 참고해 주세요."
          : null);
      }).catch(() => {
        if (!disposed) {
          setError("지도를 불러오지 못했습니다. 주소를 참고해 주세요.");
        }
      });

    return () => {
      disposed = true;
      markerController.current = null;
      controller?.destroy();
    };
  }, [candidates, key, label, latitude, longitude, setActiveCandidateId]);

  return (
    <div>
      <div
        ref={ref}
        role="region"
        aria-label={`${label} 위치 지도`}
        className="flex h-56 items-center justify-center overflow-hidden rounded-lg bg-emerald-50 text-center text-sm text-emerald-900"
      />
      {!key && (
        <p className="mt-2 text-xs leading-relaxed text-stone-500">
          지도 연결 전에는 위치 미리보기를 표시합니다.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
