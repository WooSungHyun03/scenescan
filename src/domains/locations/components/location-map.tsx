"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoPoint } from "@/types/domain";
import { createKakaoMapAdapter, mockMapAdapter } from "@/domains/locations/services/map-adapter";

export function LocationMap({ point }: { point: GeoPoint }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { latitude, longitude } = point;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    const adapter = key && process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false" ? createKakaoMapAdapter(key) : mockMapAdapter;
    adapter.mount(element, { latitude, longitude }).catch(() => setError("지도를 불러오지 못했습니다."));
  }, [latitude, longitude]);
  return <div><div ref={ref} role="img" aria-label="장소 위치 지도" className="flex h-56 items-center justify-center rounded-lg bg-emerald-50 text-center text-sm text-emerald-900" />{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}
