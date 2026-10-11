"use client";

import { useId, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { CameraLightingControl } from "@/domains/locations/components/camera-lighting-control";
import { SolarDirectionVisualization } from "@/domains/locations/components/solar-direction-visualization";
import {
  DEFAULT_LOCATION_TIME_ZONE,
  formatInstantInTimeZone,
  formatTimeZoneWithOffset,
  resolveLocationTimeZone,
  type ZonedDateTimeErrorCode,
} from "@/domains/locations/services/location-timezone";
import { getSolarDayTimesAtLocationDate, getSolarPositionAtLocationTime } from "@/domains/locations/services/solar-position";
import type { GeoPoint, SolarPosition } from "@/types/domain";

type SolarCalculation =
  | { state: "idle" }
  | { state: "error"; code: ZonedDateTimeErrorCode | "CALCULATION_ERROR" }
  | {
      state: "ready";
      instant: Date;
      position: SolarPosition;
      isAmbiguous: boolean;
    };

function getErrorMessage(code: Extract<SolarCalculation, { state: "error" }>["code"]) {
  if (code === "NONEXISTENT_LOCAL_TIME") {
    return "해당 시간대의 일광절약시간 전환으로 존재하지 않는 시각입니다. 다른 시간을 선택해 주세요.";
  }
  if (code === "INVALID_TIME_ZONE") {
    return "촬영지 시간대 정보를 확인할 수 없습니다.";
  }
  return "선택한 시각의 태양 위치를 계산하지 못했습니다. 날짜와 시간을 다시 확인해 주세요.";
}

export function SolarPanel({
  point,
  timeZone,
  shootDate,
  shootTime,
  onShootDateChange,
  onShootTimeChange,
}: {
  point: GeoPoint;
  timeZone?: string;
  shootDate: string;
  shootTime: string;
  onShootDateChange: (value: string) => void;
  onShootTimeChange: (value: string) => void;
}) {
  const dateInputId = useId();
  const timeInputId = useId();
  const timeZoneNoteId = useId();
  const [cameraHeadingDegrees, setCameraHeadingDegrees] = useState(0);
  const locationTimeZone = resolveLocationTimeZone(timeZone);
  const dayTimes = useMemo(() => {
    if (!shootDate) return null;
    try {
      const result = getSolarDayTimesAtLocationDate(point, { date: shootDate, timeZone: locationTimeZone });
      return result.ok ? result.times : null;
    } catch {
      return null;
    }
  }, [point, shootDate, locationTimeZone]);
  const clockFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("ko-KR", {
        timeZone: locationTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      });
    } catch {
      return null;
    }
  }, [locationTimeZone]);

  const calculation = useMemo<SolarCalculation>(() => {
    if (!shootDate || !shootTime) return { state: "idle" };

    try {
      const result = getSolarPositionAtLocationTime(point, {
        date: shootDate,
        time: shootTime,
        timeZone: locationTimeZone,
      });
      if (!result.ok) return { state: "error", code: result.code };

      const { instant, position, isAmbiguous } = result;
      if (
        !Number.isFinite(position.azimuthDegrees) ||
        !Number.isFinite(position.altitudeDegrees)
      ) {
        return { state: "error", code: "CALCULATION_ERROR" };
      }
      return { state: "ready", instant, position, isAmbiguous };
    } catch {
      return { state: "error", code: "CALCULATION_ERROR" };
    }
  }, [locationTimeZone, point, shootDate, shootTime]);

  let timeZoneLabel = "시간대 확인 불가";
  if (clockFormatter) {
    timeZoneLabel = formatTimeZoneWithOffset(
      locationTimeZone,
      calculation.state === "ready" ? calculation.instant : new Date(),
    );
  }
  const timeZoneName = locationTimeZone === DEFAULT_LOCATION_TIME_ZONE ? "한국 표준시 · " : "";

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <label
          htmlFor={dateInputId}
          className="block text-sm font-semibold text-stone-800"
        >
          촬영 날짜
          <input
            id={dateInputId}
            type="date"
            name="shoot-date"
            aria-describedby={timeZoneNoteId}
            value={shootDate}
            onChange={(event) => onShootDateChange(event.target.value)}
            className="mt-2 block w-full rounded-md border border-stone-300 bg-white p-2.5 font-normal text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <label
          htmlFor={timeInputId}
          className="block text-sm font-semibold text-stone-800"
        >
          촬영 시간
          <input
            id={timeInputId}
            type="time"
            name="shoot-time"
            aria-describedby={timeZoneNoteId}
            step={60}
            value={shootTime}
            onChange={(event) => onShootTimeChange(event.target.value)}
            className="mt-2 block w-full rounded-md border border-stone-300 bg-white p-2.5 font-normal text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
      </div>

      <p
        id={timeZoneNoteId}
        className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-stone-500"
      >
        <Clock3 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          촬영지 시간대: <strong className="font-semibold text-stone-700">{timeZoneName}{timeZoneLabel}</strong>
          <span className="block">기기의 시스템 시간대와 관계없이 이 기준으로 계산합니다.</span>
        </span>
      </p>

      <div aria-live="polite" className="mt-4">
        {dayTimes && clockFormatter && (
          <div className="mb-4 text-sm text-stone-700">
            <dl aria-label="촬영일 일출·일몰" className="grid grid-cols-2 gap-3 rounded-lg border border-stone-200 bg-white p-3">
              {([['일출', dayTimes.sunrise], ['일몰', dayTimes.sunset]] as const).map(([label, instant]) => (
                <div key={label}>
                  <dt className="text-xs text-stone-500">{label}</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {instant ? <time dateTime={instant.toISOString()}>{clockFormatter.format(instant)}</time> : "계산 가능한 시각 없음"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">촬영지 시간대 기준 SunCalc 계산값입니다. 지형·건물·날씨에 따라 실제 보이는 시각은 달라질 수 있습니다.</p>
          </div>
        )}
        {calculation.state === "idle" && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-600">
            날짜와 시간을 모두 선택하면 태양 위치를 계산합니다.
          </div>
        )}

        {calculation.state === "error" && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {getErrorMessage(calculation.code)}
          </div>
        )}

        {calculation.state === "ready" && (
          <div
            className={`rounded-lg border p-4 ${
              calculation.position.isAboveHorizon
                ? "border-amber-200 bg-amber-50"
                : "border-indigo-100 bg-indigo-50"
            }`}
          >
            <div>
              <p className="text-sm font-semibold text-stone-900">
                {calculation.position.isAboveHorizon
                  ? "태양이 지평선 위에 있습니다"
                  : "태양이 지평선 아래에 있습니다"}
              </p>
              <p className="mt-1 text-xs text-stone-600">
                {formatInstantInTimeZone(calculation.instant, locationTimeZone)} · 촬영지 시간
              </p>
              {calculation.isAmbiguous && (
                <p className="mt-2 text-xs font-medium text-amber-900">
                  일광절약시간 전환으로 같은 시각이 두 번 있어 더 이른 시각을 적용했습니다.
                </p>
              )}
            </div>
            <SolarDirectionVisualization
              position={calculation.position}
              cameraHeadingDegrees={cameraHeadingDegrees}
            />
            <CameraLightingControl
              position={calculation.position}
              cameraHeadingDegrees={cameraHeadingDegrees}
              onCameraHeadingChange={setCameraHeadingDegrees}
            />
          </div>
        )}
      </div>
    </div>
  );
}
