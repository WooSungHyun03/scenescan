"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatInstantInTimeZone } from "@/domains/locations/services/location-timezone";
import { SHOOTING_TIME_ZONE } from "@/domains/locations/services/shooting-time";
import { locationWeatherResponseSchema, type LocationWeather } from "@/types/weather";
import {
  ExternalInfoHttpError,
  requestExternalInfo,
} from "./external-info-request";

const WEATHER_DEBOUNCE_MILLISECONDS = 350;

type WeatherState =
  | { key: string; phase: "loading" }
  | { key: string; phase: "error"; message: string }
  | { key: string; phase: "ready"; weather: LocationWeather };

function measurement(value: number | null, unit: string) {
  return value === null ? "미제공" : `${value.toLocaleString("ko-KR")}${unit}`;
}

function requestErrorMessage(status: number) {
  if (status === 400) {
    return "이 시각의 날씨는 제공되지 않습니다. 현재 시각 기준 최근 1시간부터 앞으로 4일 이내를 선택해 주세요.";
  }
  if (status === 429) {
    return "날씨 조회가 잠시 제한되었습니다. 잠시 후 다시 확인해 주세요.";
  }
  return "날씨 정보를 불러올 수 없습니다. 태양 정보와 다른 장소 정보는 계속 확인할 수 있습니다.";
}

export function WeatherPanel({
  locationId,
  targetInstant,
}: {
  locationId: string;
  /** null = current weather; undefined = incomplete/invalid shooting time. */
  targetInstant: string | null | undefined;
}) {
  const headingId = useId();
  const key = `${locationId}:${targetInstant === undefined ? "invalid" : targetInstant ?? "current"}`;
  const [state, setState] = useState<WeatherState | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const current = state?.key === key ? state : null;
  const loading = current?.phase === "loading";

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    if (targetInstant === undefined) return;

    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => {
      setState({ key, phase: "loading" });
      const query = targetInstant ? `?${new URLSearchParams({ at: targetInstant })}` : "";
      const url = `/api/locations/${encodeURIComponent(locationId)}/weather${query}`;

      void requestExternalInfo({
        key: `weather:${url}`,
        url,
        signal: controller.signal,
        parse(value) {
          const parsed = locationWeatherResponseSchema.safeParse(
            value,
          );
          if (!parsed.success || parsed.data.weather.locationId !== locationId) {
            throw new Error("날씨 응답을 확인할 수 없습니다. 다시 확인해 주세요.");
          }
          return parsed.data.weather;
        },
      }).then((weather) => {
        if (!controller.signal.aborted && requestRef.current === controller) {
          setState({ key, phase: "ready", weather });
        }
      }).catch((error: unknown) => {
        if (controller.signal.aborted || requestRef.current !== controller) return;
        setState({
          key,
          phase: "error",
          message: error instanceof ExternalInfoHttpError
            ? requestErrorMessage(error.status)
            : error instanceof DOMException || error instanceof TypeError
            ? "날씨 조회 연결이 지연되었습니다. 태양 정보는 계속 확인할 수 있습니다."
            : error instanceof Error
              ? error.message
              : "날씨 정보를 불러오지 못했습니다. 태양 정보는 계속 확인할 수 있습니다.",
        });
      }).finally(() => {
        if (requestRef.current === controller) requestRef.current = null;
      });
    }, WEATHER_DEBOUNCE_MILLISECONDS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [key, locationId, retryCount, targetInstant]);

  function retry() {
    if (targetInstant === undefined || loading) return;
    setState({ key, phase: "loading" });
    setRetryCount((count) => count + 1);
  }

  const mode = targetInstant ? "selected" : "current";

  return (
    <section
      aria-busy={loading}
      aria-labelledby={headingId}
      className="mt-6 border-t border-stone-200 pt-5"
    >
      <h3 id={headingId} className="text-base font-semibold text-stone-900">날씨</h3>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">
        {targetInstant === undefined
          ? "촬영 날짜와 시간을 모두 올바르게 선택해 주세요. 입력이 완성될 때까지 날씨를 조회하지 않습니다."
          : targetInstant
            ? "선택한 한국 시각에 해당하는 기상청 실황 또는 예보입니다. 제공 범위를 벗어난 시각에는 날씨를 표시하지 않습니다."
            : "현재 기상청 실황입니다. 촬영 날짜와 시간을 선택하면 같은 입력 시각의 예보로 바뀝니다."}
      </p>

      <div aria-live="polite" className="mt-3 min-h-6">
        {targetInstant !== undefined && !current && (
          <p role="status" className="text-sm text-stone-600">
            {targetInstant ? "선택한 시각의 날씨 조회를 준비하고 있습니다." : "현재 날씨 조회를 준비하고 있습니다."}
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm text-stone-600">
            기상청 날씨 정보를 불러오고 있습니다.
          </p>
        )}
        {current?.phase === "error" && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-800">
            <p>{current.message}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-semibold text-red-900 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            >
              <RefreshCw size={15} aria-hidden="true" />
              날씨 다시 확인
            </button>
          </div>
        )}
        {current?.phase === "ready" && (
          <WeatherReadout mode={mode} weather={current.weather} />
        )}
      </div>
    </section>
  );
}

export function WeatherReadout({
  mode,
  weather,
}: {
  mode: "current" | "selected";
  weather: LocationWeather;
}) {
  const timestamp = weather.observedAt ?? weather.forecastAt;
  if (!timestamp) return null;

  const sky = weather.skyCondition === "clear"
    ? "맑음"
    : weather.skyCondition === "mostly-cloudy"
      ? "구름 많음"
      : weather.skyCondition === "cloudy"
        ? "흐림"
        : "미제공";
  const product = weather.purpose === "observation"
    ? "실황"
    : weather.purpose === "ultra-short-forecast"
      ? "초단기예보"
      : "단기예보";
  const title = mode === "current"
    ? `현재 날씨 · ${product}`
    : weather.purpose === "observation"
      ? `선택 시각 날씨 · ${product}`
      : `선택 시각 예보 · ${product}`;

  return (
    <div className="text-sm text-stone-700">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-xs text-stone-500">
        {weather.purpose === "observation" ? "관측 시각" : "예보 시각"} {formatInstantInTimeZone(new Date(timestamp), SHOOTING_TIME_ZONE)}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {[
          ["기온", measurement(weather.temperatureCelsius, "℃")],
          ["하늘", sky],
          ["강수확률", measurement(weather.precipitationProbabilityPercent, "%")],
          ["풍속", measurement(weather.windSpeedMetersPerSecond, "m/s")],
          ["습도", measurement(weather.humidityPercent, "%")],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-stone-500">{label}</dt>
            <dd className="mt-1 font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-stone-500">
        발표 시각 {formatInstantInTimeZone(new Date(weather.issuedAt), SHOOTING_TIME_ZONE)} · 한국 표준시
      </p>
      <a
        href={weather.source.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block break-words text-xs text-emerald-800 underline underline-offset-2"
      >
        {weather.source.dataset} 출처
      </a>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">{weather.source.license}</p>
    </div>
  );
}
