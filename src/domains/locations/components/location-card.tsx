"use client";

import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { ShortlistButton } from "@/domains/locations/components/shortlist-button";
import type { Location } from "@/types/domain";

const categoryLabels: Record<Location["category"], string> = {
  urban: "도시",
  nature: "자연",
  industrial: "산업",
  interior: "실내",
};

export function LocationCard({
  location,
  similarity,
  rank,
  eager = false,
  highlighted = false,
  onHighlightChange,
}: {
  location: Location;
  similarity?: number;
  rank?: number;
  eager?: boolean;
  highlighted?: boolean;
  onHighlightChange?: (highlighted: boolean) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const primaryImage = location.images[0];
  const imageAlt = primaryImage?.alt.trim() || `${location.name || "장소"} 대표 이미지`;

  return (
    <article
      data-highlighted={highlighted || undefined}
      onMouseEnter={() => onHighlightChange?.(true)}
      onMouseLeave={() => onHighlightChange?.(false)}
      onFocus={() => onHighlightChange?.(true)}
      onBlur={() => onHighlightChange?.(false)}
      onPointerDown={() => onHighlightChange?.(true)}
      onClick={() => onHighlightChange?.(true)}
      className={`scene-panel group relative overflow-hidden transition-all hover:shadow-md ${highlighted ? "ring-2 ring-emerald-700 shadow-md" : ""}`}
    >
      <div className="relative aspect-[4/3] bg-stone-200">
        {imageFailed ? (
          <div
            role="img"
            aria-label={`${imageAlt} - 이미지를 불러올 수 없습니다`}
            className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-stone-500"
          >
            <ImageOff size={28} aria-hidden="true" />
            <span className="text-xs font-semibold">이미지 정보 없음</span>
          </div>
        ) : (
          <Image
            src={primaryImage?.imageUrl.trim() || "/images/placeholder.svg"}
            alt={imageAlt}
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform group-hover:scale-[1.02]"
            onError={() => setImageFailed(true)}
          />
        )}
        {rank !== undefined && (
          <span className="absolute left-3 top-3 rounded-full bg-stone-950/80 px-2.5 py-1 text-xs font-bold text-white">
            {rank}위
          </span>
        )}
        {highlighted && (
          <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-emerald-950 shadow-sm">
            지도에서 선택됨
          </span>
        )}
        <div className="absolute right-3 top-3 z-20">
          <ShortlistButton
            locationId={location.id}
            locationName={location.name}
            compact
          />
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold">
            <Link
              href={`/locations/${location.id}`}
              className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
            >
              {location.name}
            </Link>
          </h3>
          {similarity !== undefined && (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              유사도 {Math.round(similarity * 100)}%
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-stone-600">
          {location.region} · {categoryLabels[location.category]}
        </p>
      </div>
    </article>
  );
}
