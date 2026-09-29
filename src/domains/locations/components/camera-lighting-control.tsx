"use client";

import { useId } from "react";
import { Camera, Check } from "lucide-react";
import { classifyLighting } from "@/domains/locations/services/lighting-classification";
import type {
  LightingClassification,
  SolarPosition,
} from "@/types/domain";

const lightingCopy: Record<
  LightingClassification,
  { label: string; description: string; className: string }
> = {
  "front-light": {
    label: "순광",
    description: "태양이 카메라 뒤쪽에 있어 피사체 정면을 비춥니다.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-950",
  },
  "side-light": {
    label: "측광",
    description: "빛이 카메라 옆쪽에서 들어와 입체감과 대비가 생깁니다.",
    className: "border-amber-200 bg-amber-50 text-amber-950",
  },
  "back-light": {
    label: "역광",
    description: "카메라가 태양 쪽을 향해 실루엣이나 플레어가 생길 수 있습니다.",
    className: "border-rose-200 bg-rose-50 text-rose-950",
  },
};

const headingShortcuts = [
  { label: "북", value: 0 },
  { label: "동", value: 90 },
  { label: "남", value: 180 },
  { label: "서", value: 270 },
] as const;

const headingLabels = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"] as const;

function getHeadingLabel(headingDegrees: number) {
  return headingLabels[Math.round(headingDegrees / 45) % headingLabels.length];
}

export function CameraLightingControl({
  position,
  cameraHeadingDegrees,
  onCameraHeadingChange,
}: {
  position: SolarPosition;
  cameraHeadingDegrees: number;
  onCameraHeadingChange: (headingDegrees: number) => void;
}) {
  const sliderId = useId();
  const descriptionId = useId();
  const classification = classifyLighting(position, cameraHeadingDegrees);
  const result = classification ? lightingCopy[classification] : null;

  return (
    <section
      aria-labelledby={`${sliderId}-title`}
      className="mt-5 border-t border-stone-900/10 pt-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4
            id={`${sliderId}-title`}
            className="flex items-center gap-2 text-sm font-semibold text-stone-900"
          >
            <Camera size={16} aria-hidden="true" />
            카메라 방향
          </h4>
          <p id={descriptionId} className="mt-1 text-xs text-stone-600">
            녹색 화살표가 카메라가 바라보는 방향입니다.
          </p>
        </div>
        <output
          htmlFor={sliderId}
          className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-900 shadow-sm"
        >
          {getHeadingLabel(cameraHeadingDegrees)} · {cameraHeadingDegrees}°
        </output>
      </div>

      <label htmlFor={sliderId} className="sr-only">
        카메라 방위각
      </label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={359}
        step={1}
        value={cameraHeadingDegrees}
        aria-describedby={descriptionId}
        onChange={(event) => onCameraHeadingChange(Number(event.target.value))}
        className="mt-4 block w-full cursor-pointer accent-emerald-700"
      />
      <div className="mt-1 flex justify-between text-[11px] font-medium text-stone-500" aria-hidden="true">
        <span>북 0°</span>
        <span>동 90°</span>
        <span>남 180°</span>
        <span>서 270°</span>
        <span>북 359°</span>
      </div>

      <div
        role="group"
        aria-label="카메라 방향 바로 선택"
        className="mt-3 grid grid-cols-4 gap-2"
      >
        {headingShortcuts.map((heading) => (
          <button
            key={heading.value}
            type="button"
            aria-pressed={cameraHeadingDegrees === heading.value}
            onClick={() => onCameraHeadingChange(heading.value)}
            className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 ${
              cameraHeadingDegrees === heading.value
                ? "border-emerald-800 bg-emerald-800 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:border-emerald-700"
            }`}
          >
            {cameraHeadingDegrees === heading.value && <Check size={13} aria-hidden="true" />}
            {heading.label}
          </button>
        ))}
      </div>

      <div
        role="status"
        aria-live="polite"
        className={`mt-4 rounded-lg border p-4 ${
          result
            ? result.className
            : "border-stone-200 bg-stone-100 text-stone-700"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
            조명 방향
          </p>
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-sm font-bold shadow-sm">
            {result?.label ?? "분류 불가"}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed">
          {result?.description ??
            "태양이 지평선 아래에 있어 순광·측광·역광을 분류하지 않습니다."}
        </p>
      </div>
    </section>
  );
}
