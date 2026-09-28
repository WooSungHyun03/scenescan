"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink, ImageOff, Images } from "lucide-react";
import type { LocationImage } from "@/types/domain";

type LocationImageGalleryProps = {
  images: LocationImage[];
  locationName: string;
  sourceUrl?: string | null;
};

function getSafeUrl(value: string | null | undefined, allowLocalPath = false) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (
    allowLocalPath &&
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//")
  ) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function SourceAttribution({ sourceUrl }: { sourceUrl: string | null }) {
  if (!sourceUrl) return null;

  return (
    <p className="mt-3 text-xs text-stone-500">
      원본 데이터·이미지 출처:{" "}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950"
      >
        출처 및 저작자 정보 보기
        <ExternalLink size={12} aria-hidden="true" />
      </a>
    </p>
  );
}

export function LocationImageGallery({
  images,
  locationName,
  sourceUrl,
}: LocationImageGalleryProps) {
  const availableImages = images.flatMap((image) => {
    const imageUrl = getSafeUrl(image.imageUrl, true);
    return imageUrl ? [{ ...image, imageUrl }] : [];
  });
  const safeSourceUrl = getSafeUrl(sourceUrl);
  const [selectedId, setSelectedId] = useState(availableImages[0]?.id ?? null);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const selectedImage =
    availableImages.find((image) => image.id === selectedId) ??
    availableImages[0];
  const safeLocationName = locationName.trim() || "장소";

  function getImageAlt(image: LocationImage, index: number) {
    return image.alt.trim() || `${safeLocationName} ${index + 1}번째 이미지`;
  }

  function markImageAsFailed(imageId: string) {
    setFailedImageIds((current) => {
      if (current.has(imageId)) return current;

      const next = new Set(current);
      next.add(imageId);
      return next;
    });
  }

  if (!selectedImage) {
    return (
      <section aria-labelledby="image-gallery-title">
        <h2 id="image-gallery-title" className="mb-3 text-lg font-semibold">
          이미지 갤러리
        </h2>
        <div className="scene-panel flex aspect-[16/10] flex-col items-center justify-center bg-stone-100 text-stone-500">
          <Images size={32} aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold">등록된 이미지가 없습니다</p>
          <p className="mt-1 text-xs">정보 없음</p>
        </div>
        <SourceAttribution sourceUrl={safeSourceUrl} />
      </section>
    );
  }

  const selectedIndex = availableImages.indexOf(selectedImage);

  return (
    <section aria-labelledby="image-gallery-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="image-gallery-title" className="text-lg font-semibold">
          이미지 갤러리
        </h2>
        <span className="text-sm text-stone-500">
          {selectedIndex + 1} / {availableImages.length}
        </span>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-stone-200">
        {failedImageIds.has(selectedImage.id) ? (
          <div
            role="img"
            aria-label={`${getImageAlt(selectedImage, selectedIndex)} - 이미지를 불러올 수 없습니다`}
            className="flex h-full flex-col items-center justify-center bg-stone-100 px-6 text-center text-stone-500"
          >
            <ImageOff size={36} aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold">
              이미지를 불러올 수 없습니다
            </p>
            <p className="mt-1 text-xs">다른 이미지를 선택해 주세요.</p>
          </div>
        ) : (
          <Image
            key={selectedImage.id}
            src={selectedImage.imageUrl}
            alt={getImageAlt(selectedImage, selectedIndex)}
            fill
            priority
            unoptimized
            sizes="(max-width: 1024px) 100vw, 65vw"
            className="object-cover"
            onError={() => markImageAsFailed(selectedImage.id)}
          />
        )}
      </div>

      {availableImages.length > 1 && (
        <div
          role="group"
          className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5"
          aria-label="갤러리 이미지 선택"
        >
          {availableImages.map((image, index) => (
            <button
              key={image.id}
              type="button"
              aria-label={`${getImageAlt(image, index)} 보기`}
              aria-pressed={image.id === selectedImage.id}
              onClick={() => setSelectedId(image.id)}
              className={`relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                image.id === selectedImage.id
                  ? "border-emerald-700"
                  : "border-transparent hover:border-stone-400"
              }`}
            >
              {failedImageIds.has(image.id) ? (
                <span className="flex h-full items-center justify-center text-stone-400">
                  <ImageOff size={22} aria-hidden="true" />
                </span>
              ) : (
                <Image
                  src={image.imageUrl}
                  alt=""
                  fill
                  unoptimized
                  sizes="120px"
                  className="object-cover"
                  onError={() => markImageAsFailed(image.id)}
                />
              )}
            </button>
          ))}
        </div>
      )}

      <SourceAttribution sourceUrl={safeSourceUrl} />
    </section>
  );
}
