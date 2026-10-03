"use client";

import { useEffect, useRef, useState } from "react";
import { publicEnv } from "@/env/public";
import type { GeoPoint } from "@/types/domain";
import {
  createKakaoMapAdapter,
  mockMapAdapter,
  type MapMountController,
} from "@/domains/locations/services/map-adapter";

export function LocationMap({
  point,
  label,
}: {
  point: GeoPoint;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { latitude, longitude } = point;
  const key = publicEnv.kakaoMapKey;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let disposed = false;
    let controller: MapMountController | null = null;
    const adapter = key ? createKakaoMapAdapter(key) : mockMapAdapter;

    adapter
      .mount(element, { latitude, longitude }, label)
      .then((mountedController) => {
        if (disposed) {
          mountedController.destroy();
          return;
        }
        controller = mountedController;
        setError(null);
      })
      .catch(async () => {
        if (disposed) return;
        const fallbackController = await mockMapAdapter.mount(
          element,
          { latitude, longitude },
          label,
        );
        if (disposed) {
          fallbackController.destroy();
          return;
        }
        controller = fallbackController;
        setError("지도를 불러오지 못했습니다. 위치 미리보기와 주소를 참고해 주세요.");
      });

    return () => {
      disposed = true;
      controller?.destroy();
    };
  }, [key, label, latitude, longitude]);

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
