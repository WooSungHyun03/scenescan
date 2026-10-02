"use client";

import { useId, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { CameraLightingControl } from "@/domains/locations/components/camera-lighting-control";
import { SolarDirectionVisualization } from "@/domains/locations/components/solar-direction-visualization";
import { getSolarPosition } from "@/domains/locations/services/solar-position";
import type { GeoPoint } from "@/types/domain";

type SolarCalculation =
  | { state: "idle" }
  | { state: "error" }
  | {
      state: "ready";
      instant: Date;
      position: ReturnType<typeof getSolarPosition>;
    };

export function SolarPanel({ point }: { point: GeoPoint }) {
  const dateInputId = useId();
  const timeInputId = useId();
  const timeZoneNoteId = useId();
  const [shootDate, setShootDate] = useState("");
  const [shootTime, setShootTime] = useState("");
  const [cameraHeadingDegrees, setCameraHeadingDegrees] = useState(0);

  const calculation = useMemo<SolarCalculation>(() => {
    if (!shootDate || !shootTime) return { state: "idle" };

    // A date-time without an explicit offset is interpreted by the browser in
    // the user's local time zone. Offset calculation stays outside the UI.
    const instant = new Date(`${shootDate}T${shootTime}`);
    if (Number.isNaN(instant.getTime())) return { state: "error" };

    try {
      const position = getSolarPosition(point, instant);
      if (
        !Number.isFinite(position.azimuthDegrees) ||
        !Number.isFinite(position.altitudeDegrees)
      ) {
        return { state: "error" };
      }
      return { state: "ready", instant, position };
    } catch {
      return { state: "error" };
    }
  }, [point, shootDate, shootTime]);

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
            aria-describedby={timeZoneNoteId}
            value={shootDate}
            onChange={(event) => setShootDate(event.target.value)}
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
            aria-describedby={timeZoneNoteId}
            step={60}
            value={shootTime}
            onChange={(event) => setShootTime(event.target.value)}
            className="mt-2 block w-full rounded-md border border-stone-300 bg-white p-2.5 font-normal text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
      </div>

      <p
        id={timeZoneNoteId}
        className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-stone-500"
      >
        <Clock3 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        입력한 날짜와 시간은 현재 기기의 현지 시간대로 해석됩니다.
      </p>

      <div aria-live="polite" className="mt-4">
        {calculation.state === "idle" && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-600">
            날짜와 시간을 모두 선택하면 태양 위치를 계산합니다.
          </div>
        )}

        {calculation.state === "error" && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            선택한 시각의 태양 위치를 계산하지 못했습니다. 날짜와 시간을 다시
            확인해 주세요.
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
                {calculation.instant.toLocaleString("ko-KR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
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
