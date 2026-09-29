"use client";

import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LocationCard } from "@/domains/locations/components/location-card";
import type { SimilarLocationsResponse } from "@/types/contracts";
import type { LocationSearchResult } from "@/types/domain";

type RequestStatus = "idle" | "loading" | "success" | "error";

function isSimilarLocationsResponse(
  value: unknown,
): value is SimilarLocationsResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "results" in value &&
    Array.isArray(value.results)
  );
}

function ResultSkeleton() {
  return (
    <div
      role="status"
      aria-label="비슷한 장소 목록을 불러오는 중"
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="scene-panel overflow-hidden"
          aria-hidden="true"
        >
          <div className="aspect-[4/3] animate-pulse bg-stone-200" />
          <div className="space-y-3 p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-stone-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-stone-100" />
          </div>
        </div>
      ))}
      <span className="sr-only">비슷한 장소 목록을 불러오고 있습니다.</span>
    </div>
  );
}

export function SimilarLocationsSection({
  locationId,
  initialResults,
}: {
  locationId: string;
  initialResults: LocationSearchResult[];
}) {
  const [results, setResults] = useState(initialResults);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  async function refreshResults() {
    if (status === "loading") return;

    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/locations/${encodeURIComponent(locationId)}/similar`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        },
      );
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          response.status === 503
            ? "장소 데이터 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."
            : "비슷한 장소를 불러오지 못했습니다. 다시 시도해 주세요.",
        );
      }
      if (!isSimilarLocationsResponse(body)) {
        throw new Error("비슷한 장소 응답 형식을 확인할 수 없습니다.");
      }

      setResults(
        body.results
          .filter(({ location }) => location.id !== locationId)
          .slice(0, 8),
      );
      setStatus("success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "비슷한 장소를 불러오지 못했습니다. 다시 시도해 주세요.",
      );
      setStatus("error");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  const isLoading = status === "loading";

  return (
    <section className="mt-14" aria-labelledby="similar-locations-title">
      <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="scene-label">다시 탐색하기</p>
          <h2 id="similar-locations-title" className="mt-1 text-2xl font-bold">
            비슷한 촬영 장소
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
            현재 장소와 유사한 후보를 새로 불러와 비교할 수 있습니다.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshResults}
          disabled={isLoading}
          aria-controls="similar-location-results"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isLoading ? (
            <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
          ) : status === "error" ? (
            <RefreshCw size={17} aria-hidden="true" />
          ) : (
            <Sparkles size={17} aria-hidden="true" />
          )}
          {isLoading
            ? "비슷한 장소 찾는 중…"
            : status === "error"
              ? "다시 시도"
              : "이 장소 말고 비슷한 데 더"}
        </button>
      </div>

      <div aria-live="polite" aria-atomic="true" className="min-h-6">
        {status === "success" && (
          <p className="mb-4 text-sm font-semibold text-emerald-800">
            비슷한 장소 목록을 새로 불러왔습니다.
          </p>
        )}
        {status === "error" && errorMessage && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {errorMessage}
          </p>
        )}
      </div>

      <div id="similar-location-results">
        {isLoading ? (
          <ResultSkeleton />
        ) : results.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {results.map(({ location, similarity }, index) => (
              <LocationCard
                key={location.id}
                location={location}
                similarity={similarity}
                rank={index + 1}
                eager={index < 4}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center">
            <Sparkles
              size={24}
              className="mx-auto text-stone-400"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm font-semibold text-stone-700">
              아직 추천할 비슷한 장소가 없습니다.
            </p>
            <p className="mt-1 text-xs text-stone-500">
              데이터가 추가된 뒤 다시 탐색해 주세요.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
