"use client";

import { CarFront, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatStraightLineDistance } from "@/domains/locations/services/parking-distance";
import { toPhoneHref } from "@/domains/locations/services/permit-verification";
import { groupLocationsByWeatherGrid } from "@/domains/locations/services/weather-grid-groups";
import type { Location } from "@/types/domain";
import {
  nearbyParkingResponseSchema,
  type NearbyParkingResponse,
} from "@/types/place-discovery";
import {
  locationWeatherResponseSchema,
  type LocationWeather,
} from "@/types/weather";
import {
  ExternalInfoHttpError,
  requestExternalInfo,
} from "./external-info-request";
import { PermitContactList } from "./permit-contact-list";
import { WeatherReadout } from "./weather-panel";

const COMPARISON_DEBOUNCE_MILLISECONDS = 350;

export type ComparisonWeatherState =
  | { phase: "loading" }
  | { phase: "ready"; weather: LocationWeather }
  | { phase: "error"; message: string };

function weatherErrorMessage(error: unknown): string {
  if (error instanceof ExternalInfoHttpError && error.status === 400) {
    return "이 시각은 기상청 제공 범위 밖입니다.";
  }
  if (error instanceof ExternalInfoHttpError && error.status === 429) {
    return "날씨 조회가 잠시 제한되었습니다.";
  }
  if (error instanceof Error && error.message.includes("contract")) {
    return "날씨 응답을 확인할 수 없습니다.";
  }
  return "날씨를 불러오지 못했습니다. 다른 비교 정보는 계속 확인할 수 있습니다.";
}

export function useComparisonWeather(
  locations: Location[],
  targetInstant: string | null | undefined,
): {
  stateByLocationId: Map<string, ComparisonWeatherState>;
  retry(): void;
} {
  const grouping = useMemo(() => groupLocationsByWeatherGrid(locations), [locations]);
  const [retryCount, setRetryCount] = useState(0);
  const requestKey = `${targetInstant === undefined ? "invalid" : targetInstant ?? "current"}|${grouping.groups
    .map((group) => `${group.key}:${group.representativeLocationId}`)
    .join("|")}|${retryCount}`;
  const [snapshot, setSnapshot] = useState<{
    requestKey: string;
    stateByGrid: Map<string, ComparisonWeatherState>;
  }>({ requestKey: "", stateByGrid: new Map() });

  useEffect(() => {
    if (targetInstant === undefined || grouping.groups.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSnapshot({
        requestKey,
        stateByGrid: new Map(grouping.groups.map((group) => [group.key, { phase: "loading" }])),
      });

      for (const group of grouping.groups) {
        const query = targetInstant ? `?${new URLSearchParams({ at: targetInstant })}` : "";
        const url = `/api/locations/${encodeURIComponent(group.representativeLocationId)}/weather${query}`;
        void requestExternalInfo({
          key: `comparison-weather:${group.key}:${targetInstant ?? "current"}`,
          url,
          signal: controller.signal,
          parse(value) {
            const parsed = locationWeatherResponseSchema.safeParse(value);
            if (
              !parsed.success
              || parsed.data.weather.locationId !== group.representativeLocationId
              || parsed.data.weather.grid.x !== group.grid.x
              || parsed.data.weather.grid.y !== group.grid.y
            ) {
              throw new Error("weather contract mismatch");
            }
            return parsed.data.weather;
          },
        }).then((weather) => {
          if (controller.signal.aborted) return;
          setSnapshot((current) => {
            if (current.requestKey !== requestKey) return current;
            const next = new Map(current.stateByGrid);
            next.set(group.key, { phase: "ready", weather });
            return { requestKey, stateByGrid: next };
          });
        }).catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSnapshot((current) => {
            if (current.requestKey !== requestKey) return current;
            const next = new Map(current.stateByGrid);
            next.set(group.key, { phase: "error", message: weatherErrorMessage(error) });
            return { requestKey, stateByGrid: next };
          });
        });
      }
    }, COMPARISON_DEBOUNCE_MILLISECONDS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [grouping, requestKey, targetInstant]);

  const stateByLocationId = new Map<string, ComparisonWeatherState>();
  for (const location of locations) {
    if (targetInstant === undefined) continue;
    if (grouping.unavailableLocationIds.has(location.id)) {
      stateByLocationId.set(location.id, {
        phase: "error",
        message: "이 장소의 좌표는 기상청 격자로 변환할 수 없습니다.",
      });
      continue;
    }
    const gridKey = grouping.gridKeyByLocationId.get(location.id);
    const state = snapshot.requestKey === requestKey && gridKey
      ? snapshot.stateByGrid.get(gridKey)
      : undefined;
    stateByLocationId.set(location.id, state ?? { phase: "loading" });
  }

  return {
    stateByLocationId,
    retry: () => setRetryCount((value) => value + 1),
  };
}

export function ComparisonWeatherSummary({
  state,
  targetInstant,
  retry,
}: {
  state: ComparisonWeatherState | undefined;
  targetInstant: string | null | undefined;
  retry(): void;
}) {
  if (targetInstant === undefined) {
    return <p className="text-stone-500">촬영 날짜와 시간을 모두 입력하면 예보를 비교합니다.</p>;
  }
  if (!state || state.phase === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-stone-600">
        <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> 날씨 확인 중
      </p>
    );
  }
  if (state.phase === "error") {
    return (
      <div role="alert" className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        <p>{state.message}</p>
        <button type="button" onClick={retry} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 font-bold hover:bg-amber-100">
          <RefreshCw size={14} aria-hidden="true" /> 다시 확인
        </button>
      </div>
    );
  }
  return <WeatherReadout mode={targetInstant ? "selected" : "current"} weather={state.weather} />;
}

type ParkingPhase = "loading" | "ready" | "empty" | "error";

function CandidateParkingSummary({ locationId }: { locationId: string }) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<{
    phase: ParkingPhase;
    response: NearbyParkingResponse | null;
  }>({ phase: "loading", response: null });

  useEffect(() => {
    const controller = new AbortController();
    const url = `/api/locations/${encodeURIComponent(locationId)}/parking?radius=1000`;
    void requestExternalInfo({
      key: `parking:${locationId}:1000`,
      url,
      signal: controller.signal,
      parse(value) {
        const parsed = nearbyParkingResponseSchema.safeParse(value);
        if (!parsed.success || parsed.data.locationId !== locationId) {
          throw new Error("Parking response contract is invalid");
        }
        return parsed.data;
      },
    }).then((response) => {
      if (!controller.signal.aborted) {
        setState({
          phase: response.candidates.length > 0 ? "ready" : "empty",
          response,
        });
      }
    }).catch(() => {
      if (!controller.signal.aborted) setState({ phase: "error", response: null });
    });
    return () => controller.abort();
  }, [locationId, requestVersion]);

  if (state.phase === "loading") {
    return <p role="status" className="text-xs text-stone-600">주변 주차장 확인 중</p>;
  }
  if (state.phase === "error") {
    return (
      <div role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        <p>주변 주차장을 불러오지 못했습니다. 문의 연락처는 별도로 확인할 수 있습니다.</p>
        <button type="button" onClick={() => {
          setState({ phase: "loading", response: null });
          setRequestVersion((value) => value + 1);
        }} className="mt-2 min-h-11 rounded-md px-2 font-bold hover:bg-amber-100">주차 다시 확인</button>
      </div>
    );
  }
  if (state.phase === "empty" || !state.response) {
    return <p className="text-xs text-stone-500">1km 안에서 제공된 주차장 후보가 없습니다.</p>;
  }

  return (
    <div className="space-y-2">
      {state.response.candidates.map((candidate) => {
        const phoneHref = candidate.phone ? toPhoneHref(candidate.phone) : null;
        return (
          <article key={candidate.id} className="rounded-lg border border-stone-200 bg-white p-3">
            <p className="font-semibold text-stone-900">{candidate.name}</p>
            <p className="mt-1 text-xs text-stone-600">{formatStraightLineDistance(candidate.distanceMeters)}</p>
            <p className="mt-1 break-words text-xs text-stone-600">{candidate.address ?? "주소 미제공"}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              {phoneHref && candidate.phone && <a href={phoneHref} className="min-h-11 rounded-md bg-stone-100 px-2 py-3">{candidate.phone}</a>}
              {candidate.placeUrl && <a href={candidate.placeUrl} target="_blank" rel="noreferrer" className="min-h-11 rounded-md bg-[#fee500] px-2 py-3">카카오맵</a>}
            </div>
          </article>
        );
      })}
      <p className="text-[11px] leading-relaxed text-stone-500">직선거리 기준이며 요금·운영시간·빈자리·촬영차량 허용 여부는 제공하지 않습니다.</p>
    </div>
  );
}

export function CandidateExternalInfo({ locationId }: { locationId: string }) {
  return (
    <div className="space-y-5">
      <section aria-label="동적 주변 주차장">
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-stone-800">
          <CarFront size={14} aria-hidden="true" /> 1km 주변 주차장 후보
        </h4>
        <CandidateParkingSummary locationId={locationId} />
      </section>
      <section aria-label="촬영 문의 연락처" className="border-t border-stone-200 pt-4">
        <h4 className="mb-2 text-xs font-bold text-stone-800">문의 연락처 구분</h4>
        <PermitContactList locationId={locationId} />
      </section>
    </div>
  );
}
