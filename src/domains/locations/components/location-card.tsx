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
  matchedImageId,
  rank,
  eager = false,
  highlighted = false,
  onHighlightChange,
}: {
  location: Location;
  similarity?: number;
  matchedImageId?: string;
  rank?: number;
  eager?: boolean;
  highlighted?: boolean;
  onHighlightChange?: (highlighted: boolean) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const primaryImage = location.images.find((image) => image.id === matchedImageId) ?? location.images[0];
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
      className="scene-card group relative min-w-0"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-stone-200">
        {imageFailed ? (
          <div
            role="img"
            aria-label={`${imageAlt} - 이미지를 불러올 수 없습니다`}
            className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-stone-500"
          >
            <ImageOff size={28} aria-hidden="true" />
            <span className="text-sm font-semibold">사진을 불러올 수 없습니다</span>
          </div>
        ) : (
          <Image
            src={primaryImage?.imageUrl.trim() || "/images/placeholder.svg"}
            alt={imageAlt}
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 40vw"
            className="object-cover"
            onError={() => setImageFailed(true)}
          />
        )}
        {rank !== undefined && (
          <span className="absolute left-3 top-3 rounded bg-stone-950/85 px-2.5 py-1 text-sm font-bold text-white">
            {rank}위
          </span>
        )}
        {highlighted && (
          <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-emerald-950 shadow-sm">
            선택한 장소
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
      <div className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-lg font-semibold leading-snug">
            <Link
              href={`/locations/${location.id}`}
              className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
            >
              {location.name}
            </Link>
          </h3>
          {similarity !== undefined && (
            <span className="shrink-0 rounded bg-brand-soft px-2 py-1 text-xs font-semibold text-brand" title="사진의 시각적 특징을 비교한 점수입니다. 촬영 가능 여부를 뜻하지 않습니다.">
              유사도 {Math.round(Math.max(0, Math.min(1, similarity)) * 100)}%
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-stone-600">
          {location.region} · {categoryLabels[location.category]}
        </p>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{location.description.trim() || "장소 상세에서 위치와 촬영 조건을 확인하세요."}</p>
        <p className="mt-3 text-xs text-muted">{location.permit.type || "촬영 조건 확인 필요"}{location.parking.length > 0 ? ` · 주차 정보 ${location.parking.length}곳` : " · 주차 사전 확인"}</p>
      </div>
    </article>
  );
}
