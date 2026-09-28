"use client";

import Image from "next/image";
import Link from "next/link";
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
  highlighted = false,
  onHighlightChange,
}: {
  location: Location;
  similarity?: number;
  rank?: number;
  highlighted?: boolean;
  onHighlightChange?: (highlighted: boolean) => void;
}) {
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
        <Image
          src={location.images[0]?.imageUrl ?? "/images/placeholder.svg"}
          alt={location.images[0]?.alt ?? location.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform group-hover:scale-[1.02]"
        />
        {rank !== undefined && (
          <span className="absolute left-3 top-3 rounded-full bg-stone-950/80 px-2.5 py-1 text-xs font-bold text-white">
            {rank}위
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
