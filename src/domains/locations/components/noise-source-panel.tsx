import { AlertTriangle, AudioLines, FileSearch, Info, MapPin, Volume2 } from "lucide-react";
import type { NoiseSource } from "@/types/domain";
import { SourceAttribution } from "./source-attribution";
import {
  getNoiseSourceKindLabel,
  isNoiseSourceVerificationStale,
} from "@/domains/locations/services/noise-source";

function getValue(value: string | null | undefined) {
  return value?.trim() || null;
}

export function NoiseSourcePanel({
  noiseSources,
}: {
  noiseSources: NoiseSource[];
}) {
  return (
    <section aria-labelledby="noise-title" className="scene-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AudioLines
            size={20}
            className="mt-0.5 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <div>
            <h2 id="noise-title" className="text-lg font-semibold">
              예상 소음원
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              주변 환경을 바탕으로 확인된 촬영 방해 가능 요소입니다.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
          {noiseSources.length ? `${noiseSources.length}개` : "확인된 정보 없음"}
        </span>
      </div>

      {noiseSources.length ? (
        <ul className="mt-5 space-y-3">
          {noiseSources.map((source, index) => {
            const kind = getNoiseSourceKindLabel(source.kind);
            const description = getValue(source.description);
            const evidence = getValue(source.evidence);
            const stale = isNoiseSourceVerificationStale(source.lastVerifiedAt);

            return (
              <li
                key={`${source.sourceUrl ?? source.kind}-${index}`}
                className="rounded-xl border border-amber-200 bg-amber-50/40 p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800"
                    aria-hidden="true"
                  >
                    <Volume2 size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-amber-800">
                      소음원 {index + 1}
                    </p>
                    <h3
                      className={`mt-0.5 break-words font-semibold ${
                        kind ? "text-stone-900" : "text-stone-500"
                      }`}
                    >
                      {kind}
                    </h3>
                    {source.distanceMeters !== null && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-stone-600">
                        <MapPin size={13} aria-hidden="true" />
                        지도상 약 {Math.round(source.distanceMeters).toLocaleString("ko-KR")}m
                      </p>
                    )}
                  </div>
                </div>

                <p className="mt-3 break-words text-sm leading-relaxed text-stone-700">
                  {description ?? "설명 정보 없음"}
                </p>

                {evidence && <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-100 bg-white/80 p-3">
                  <FileSearch
                    size={16}
                    className="mt-0.5 shrink-0 text-stone-500"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-stone-500">
                      판단 근거
                    </p>
                    <p
                      className={`mt-1 break-words text-sm leading-relaxed ${
                        evidence ? "text-stone-700" : "text-stone-500"
                      }`}
                    >
                      {evidence}
                    </p>
                  </div>
                </div>}

                <div className="mt-3 border-t border-amber-200 pt-3">
                  <SourceAttribution
                    source={source.source}
                    sourceUrl={source.sourceUrl}
                    license={source.license}
                    licenseUrl={source.licenseUrl}
                    lastVerifiedAt={source.lastVerifiedAt}
                    label="지도 정보 출처"
                    compact
                    showDetails
                  />
                  {source.referenceDate && (
                    <p className="mt-1 text-xs text-stone-600">지도 기준일 {source.referenceDate}</p>
                  )}
                </div>
                {stale && (
                  <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-orange-100 p-2.5 text-xs leading-relaxed text-orange-900">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    확인 후 1년이 지났거나 확인일이 없어 최신 현황을 다시 확인해야 합니다.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center">
          <AudioLines
            size={24}
            className="mx-auto text-stone-400"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-semibold text-stone-700">
            확인된 주변 소음 정보가 없습니다.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            소음이 없다는 의미는 아니므로 촬영 시간대에 현장을 직접 확인해
            주세요.
          </p>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-stone-100 p-3 text-xs leading-relaxed text-stone-600">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          주변 소음 안내는 주변 시설과 환경을 바탕으로 한 참고 정보이며 실제 소음 측정값
          또는 dB 수치가 아닙니다.
        </p>
      </div>
    </section>
  );
}
