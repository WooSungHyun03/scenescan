import type { SolarPosition } from "@/types/domain";

const compassDirections = [
  "북",
  "북동",
  "동",
  "남동",
  "남",
  "남서",
  "서",
  "북서",
] as const;

function getCompassDirection(azimuthDegrees: number) {
  const index = Math.round(azimuthDegrees / 45) % compassDirections.length;
  return compassDirections[index];
}

export function SolarDirectionVisualization({
  position,
  cameraHeadingDegrees,
}: {
  position: SolarPosition;
  cameraHeadingDegrees?: number;
}) {
  const direction = getCompassDirection(position.azimuthDegrees);
  const visualAltitude = Math.max(
    -90,
    Math.min(90, position.altitudeDegrees),
  );
  const altitudeMarkerY = 80 - (visualAltitude / 90) * 55;
  const accent = position.isAboveHorizon ? "#d97706" : "#4338ca";
  const sunFill = position.isAboveHorizon ? "#fbbf24" : "#818cf8";

  return (
    <div className="mt-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="rounded-xl border border-stone-900/10 bg-white/70 p-3">
          <p className="text-center text-xs font-semibold text-stone-600">
            빛의 수평 방향
          </p>
          <div
            role="img"
            aria-label={`태양 방위각 ${position.azimuthDegrees.toFixed(1)}도, ${direction} 방향${cameraHeadingDegrees === undefined ? "" : `, 카메라 방위각 ${cameraHeadingDegrees}도`}`}
            className="mx-auto mt-2 aspect-square w-full max-w-52"
          >
            <svg
              viewBox="0 0 220 220"
              className="h-full w-full"
              aria-hidden="true"
            >
              <circle
                cx="110"
                cy="110"
                r="88"
                fill="#fafaf9"
                stroke="#d6d3d1"
                strokeWidth="2"
              />
              <circle
                cx="110"
                cy="110"
                r="68"
                fill="none"
                stroke="#e7e5e4"
                strokeDasharray="3 5"
              />
              {Array.from({ length: 12 }, (_, index) => (
                <line
                  key={index}
                  x1="110"
                  y1="24"
                  x2="110"
                  y2={index % 3 === 0 ? "36" : "31"}
                  stroke={index % 3 === 0 ? "#78716c" : "#d6d3d1"}
                  strokeWidth={index % 3 === 0 ? "2" : "1.5"}
                  transform={`rotate(${index * 30} 110 110)`}
                />
              ))}
              <line
                x1="110"
                y1="44"
                x2="110"
                y2="176"
                stroke="#e7e5e4"
                strokeWidth="1"
              />
              <line
                x1="44"
                y1="110"
                x2="176"
                y2="110"
                stroke="#e7e5e4"
                strokeWidth="1"
              />
              <text x="110" y="19" textAnchor="middle" className="fill-red-700 text-[13px] font-bold">
                N
              </text>
              <text x="202" y="115" textAnchor="middle" className="fill-stone-600 text-[12px] font-bold">
                E
              </text>
              <text x="110" y="211" textAnchor="middle" className="fill-stone-600 text-[12px] font-bold">
                S
              </text>
              <text x="18" y="115" textAnchor="middle" className="fill-stone-600 text-[12px] font-bold">
                W
              </text>
              {cameraHeadingDegrees !== undefined && (
                <g transform={`rotate(${cameraHeadingDegrees} 110 110)`}>
                  <path
                    d="M110 110 L82 58 A62 62 0 0 1 138 58 Z"
                    fill="#059669"
                    fillOpacity="0.14"
                  />
                  <line
                    x1="110"
                    y1="110"
                    x2="110"
                    y2="70"
                    stroke="#047857"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  <path d="M110 60 L101 76 L119 76 Z" fill="#047857" />
                </g>
              )}
              <g transform={`rotate(${position.azimuthDegrees} 110 110)`}>
                <line
                  x1="110"
                  y1="110"
                  x2="110"
                  y2="53"
                  stroke={accent}
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path d="M110 36 L99 58 L121 58 Z" fill={accent} />
                <circle
                  cx="110"
                  cy="44"
                  r="8"
                  fill={sunFill}
                  stroke={accent}
                  strokeWidth="2"
                />
              </g>
              <circle cx="110" cy="110" r="7" fill="#1c1917" />
              <circle cx="110" cy="110" r="3" fill="#ffffff" />
            </svg>
          </div>
          <p className="mt-1 text-center text-sm font-semibold text-stone-900">
            {direction} 방향 · {position.azimuthDegrees.toFixed(1)}°
          </p>
          {cameraHeadingDegrees !== undefined && (
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] font-medium text-stone-600">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                태양
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-0.5 w-3 bg-emerald-700" aria-hidden="true" />
                카메라
              </span>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-stone-900/10 bg-white/70 p-3">
          <p className="text-center text-xs font-semibold text-stone-600">
            지평선 기준 태양 고도
          </p>
          <div
            role="img"
            aria-label={`태양 고도 ${position.altitudeDegrees.toFixed(1)}도, ${position.isAboveHorizon ? "지평선 위" : "지평선 아래"}`}
            className="mx-auto mt-2 h-52 w-full max-w-44"
          >
            <svg
              viewBox="0 0 150 160"
              className="h-full w-full"
              aria-hidden="true"
            >
              <rect x="20" y="15" width="110" height="65" rx="14" fill="#fffbeb" />
              <path d="M20 80 H130 V131 Q130 145 116 145 H34 Q20 145 20 131 Z" fill="#eef2ff" />
              <line x1="20" y1="80" x2="130" y2="80" stroke="#57534e" strokeWidth="2" />
              <line
                x1="75"
                y1={altitudeMarkerY}
                x2="75"
                y2="80"
                stroke={accent}
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              <circle
                cx="75"
                cy={altitudeMarkerY}
                r="11"
                fill={sunFill}
                stroke={accent}
                strokeWidth="3"
              />
              <text x="138" y="23" textAnchor="end" className="fill-stone-500 text-[10px] font-semibold">
                +90°
              </text>
              <text x="138" y="76" textAnchor="end" className="fill-stone-600 text-[10px] font-semibold">
                0°
              </text>
              <text x="138" y="143" textAnchor="end" className="fill-stone-500 text-[10px] font-semibold">
                -90°
              </text>
              <text x="29" y="75" className="fill-stone-600 text-[10px] font-semibold">
                지평선
              </text>
            </svg>
          </div>
          <p className="mt-1 text-center text-sm font-semibold text-stone-900">
            {position.altitudeDegrees.toFixed(1)}° · {position.isAboveHorizon ? "지평선 위" : "지평선 아래"}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-900/10 pt-4">
        <div>
          <dt className="text-xs font-medium text-stone-600">방위각</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-stone-950">
            {position.azimuthDegrees.toFixed(1)}°
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-stone-600">고도</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-stone-950">
            {position.altitudeDegrees.toFixed(1)}°
          </dd>
        </div>
      </dl>
    </div>
  );
}
