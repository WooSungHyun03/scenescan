"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatInstantInTimeZone } from "@/domains/locations/services/location-timezone";
import { locationWeatherResponseSchema, type LocationWeather } from "@/types/weather";

type WeatherState =
  | { key: string; phase: "loading" }
  | { key: string; phase: "error"; message: string }
  | { key: string; phase: "ready"; weather: LocationWeather };

function measurement(value: number | null, unit: string) {
  return value === null ? "정보 없음" : `${value.toLocaleString("ko-KR")}${unit}`;
}

export function WeatherPanel({ locationId, targetInstant }: {
  locationId: string;
  /** null = current weather; undefined = incomplete/invalid shooting time. */
  targetInstant: string | null | undefined;
}) {
  const headingId = useId();
  const key = `${locationId}:${targetInstant === undefined ? "invalid" : targetInstant ?? "current"}`;
  const [state, setState] = useState<WeatherState | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const current = state?.key === key ? state : null;
  const loading = current?.phase === "loading";

  useEffect(() => () => { requestRef.current?.abort(); }, [key]);

  async function loadWeather() {
    if (targetInstant === undefined || loading) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ key, phase: "loading" });
    try {
      const query = targetInstant ? `?${new URLSearchParams({ at: targetInstant })}` : "";
      const response = await fetch(`/api/locations/${encodeURIComponent(locationId)}/weather${query}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) {
        throw new Error(response.status === 400
          ? "이 시각의 날씨는 조회할 수 없습니다. 현재 관측 또는 앞으로 4일 이내의 촬영 시각을 선택해 주세요."
          : response.status === 429
            ? "날씨 조회가 잠시 제한되었습니다. 잠시 후 다시 확인해 주세요."
            : "날씨 정보를 불러올 수 없습니다. 잠시 후 다시 확인해 주세요.");
      }
      const parsed = locationWeatherResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success || parsed.data.weather.locationId !== locationId) {
        throw new Error("날씨 응답을 확인할 수 없습니다. 다시 확인해 주세요.");
      }
      if (!controller.signal.aborted && requestRef.current === controller) {
        setState({ key, phase: "ready", weather: parsed.data.weather });
      }
    } catch (error) {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setState({ key, phase: "error", message: error instanceof DOMException || error instanceof TypeError
        ? "날씨 조회 연결이 지연되었습니다. 다시 확인해 주세요."
        : error instanceof Error ? error.message : "날씨 정보를 불러오지 못했습니다. 다시 확인해 주세요." });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  return (
    <section aria-labelledby={headingId} className="mt-6 border-t border-stone-200 pt-5">
      <h3 id={headingId} className="text-base font-semibold text-stone-900">날씨</h3>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">
        {targetInstant === undefined ? "촬영 날짜와 시간을 모두 올바르게 선택해 주세요."
          : targetInstant ? "선택한 시각의 관측 또는 예보를 확인합니다. 예보 제공 범위는 앞으로 4일까지입니다."
            : "현재 관측 정보를 확인하거나, 촬영 날짜·시간을 선택해 예보를 조회하세요."}
      </p>
      <button type="button" onClick={loadWeather} disabled={loading || targetInstant === undefined}
        className="mt-3 min-h-11 rounded-md border border-emerald-800 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? "날씨 불러오는 중…" : current?.phase === "error" ? "날씨 다시 확인" : targetInstant ? "이 시각 날씨 확인" : "현재 날씨 확인"}
      </button>
      <div aria-live="polite" className="mt-3">
        {loading && <p role="status" className="text-sm text-stone-600">기상청 날씨 정보를 불러오고 있습니다.</p>}
        {current?.phase === "error" && <p role="alert" className="text-sm leading-relaxed text-red-800">{current.message}</p>}
        {current?.phase === "ready" && <WeatherReadout weather={current.weather} />}
      </div>
    </section>
  );
}

function WeatherReadout({ weather }: { weather: LocationWeather }) {
  const timestamp = weather.observedAt ?? weather.forecastAt;
  if (!timestamp) return null;
  const sky = weather.skyCondition === "clear" ? "맑음" : weather.skyCondition === "mostly-cloudy" ? "구름 많음"
    : weather.skyCondition === "cloudy" ? "흐림" : "정보 없음";
  return (
    <div className="text-sm text-stone-700">
      <p className="font-semibold">{weather.purpose === "observation" ? "관측" : "예보"} · {formatInstantInTimeZone(new Date(timestamp), "Asia/Seoul")}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        {[["기온", measurement(weather.temperatureCelsius, "℃")], ["하늘", sky],
          ["강수확률", measurement(weather.precipitationProbabilityPercent, "%")],
          ["풍속", measurement(weather.windSpeedMetersPerSecond, "m/s")],
          ["습도", measurement(weather.humidityPercent, "%")]].map(([label, value]) => (
          <div key={label}><dt className="text-xs text-stone-500">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-stone-500">
        발표 시각 {formatInstantInTimeZone(new Date(weather.issuedAt), "Asia/Seoul")} · 한국 표준시
      </p>
      <a href={weather.source.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-emerald-800 underline underline-offset-2">기상청 단기예보 출처</a>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">{weather.source.license}</p>
    </div>
  );
}
