import { AudioLines, FileSearch, Info, Volume2 } from "lucide-react";
import type { NoiseSource } from "@/types/domain";

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
          {noiseSources.length ? `${noiseSources.length}개` : "정보 없음"}
        </span>
      </div>

      {noiseSources.length ? (
        <ul className="mt-5 space-y-3">
          {noiseSources.map((source, index) => {
            const kind = getValue(source.kind);
            const note = getValue(source.note);

            return (
              <li
                key={`${source.kind}-${source.note}-${index}`}
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
                      {kind ?? "종류 정보 없음"}
                    </h3>
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-100 bg-white/80 p-3">
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
                        note ? "text-stone-700" : "text-stone-500"
                      }`}
                    >
                      {note ?? "근거 정보 없음"}
                    </p>
                  </div>
                </div>
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
            등록된 예상 소음원이 없습니다.
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
          예상 소음원은 주변 환경에 대한 휴리스틱 참고 정보이며 실제 소음 측정값
          또는 dB 수치가 아닙니다.
        </p>
      </div>
    </section>
  );
}
