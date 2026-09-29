"use client";

import { Heart } from "lucide-react";
import { useShortlist } from "./use-shortlist";

export function ShortlistButton({
  locationId,
  locationName,
  compact = false,
}: {
  locationId: string;
  locationName: string;
  compact?: boolean;
}) {
  const { has, toggle, isReady, error } = useShortlist();
  const isSaved = has(locationId);
  const actionLabel = isSaved
    ? `${locationName} 관심 장소에서 제거`
    : `${locationName} 관심 장소에 저장`;

  return (
    <div className={compact ? "relative z-20" : "flex flex-col items-start gap-1"}>
      <button
        type="button"
        disabled={!isReady}
        aria-pressed={isSaved}
        aria-label={actionLabel}
        title={actionLabel}
        onClick={() => toggle(locationId)}
        className={
          compact
            ? `inline-flex size-11 items-center justify-center rounded-full border shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-wait ${
                isSaved
                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : "border-white/80 bg-white/95 text-stone-600 hover:text-rose-700"
              }`
            : `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-wait disabled:opacity-60 ${
                isSaved
                  ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                  : "border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-900"
              }`
        }
      >
        <Heart
          size={17}
          fill={isSaved ? "currentColor" : "none"}
          aria-hidden="true"
        />
        {!compact && (isSaved ? "관심 장소에서 제거" : "관심 장소에 저장")}
      </button>
      {error && (
        <span
          role="alert"
          className={compact ? "sr-only" : "text-xs text-red-700"}
        >
          {error}
        </span>
      )}
    </div>
  );
}
