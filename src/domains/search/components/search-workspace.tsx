"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import { Check, FileImage, ImagePlus, LoaderCircle, Search, Trash2, Upload } from "lucide-react";
import { LocationCard } from "@/domains/locations/components/location-card";
import { SearchResultsMap } from "@/domains/locations/components/search-results-map";
import { createImageEmbeddingService, type EmbeddingServiceStatus } from "@/lib/ai";
import { Button } from "@/shared/ui/button";
import type { Location, LocationCategory, LocationSearchResult, Region } from "@/types/domain";
import { REGION_VALUES } from "@/types/location-options";
import type { SearchResponse } from "@/types/contracts";

const searchModeDescription = process.env.NEXT_PUBLIC_USE_MOCK_AI === "false"
  ? "브라우저에서 실제 CLIP 임베딩을 생성합니다. 장소 데이터는 배포 환경 설정에 따라 검색됩니다."
  : "기본 설정에서는 가상 데이터와 mock 임베딩으로 검색 흐름을 체험합니다.";

const regionOptions: Region[] = [...REGION_VALUES];
const categoryOptions: { value: LocationCategory; label: string }[] = [
  { value: "urban", label: "도시" },
  { value: "nature", label: "자연" },
  { value: "industrial", label: "산업" },
  { value: "interior", label: "실내" },
];

type SearchStage = "idle" | "embedding" | "searching" | "complete";

type AiUiState = {
  kind: "loading-model" | "processing" | "searching" | "error";
  title: string;
  description: string;
  progress?: number;
};

type SearchErrorKind = "missing-image" | "invalid-image" | "model" | "network" | "database" | "request";

type SearchErrorState = {
  kind: SearchErrorKind;
  title: string;
  description: string;
  retryable: boolean;
  detail?: string;
};

class SearchApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "SearchApiError";
  }
}

function normalizeProgress(progress: number | undefined): number | undefined {
  if (progress === undefined || !Number.isFinite(progress)) return undefined;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function getAiUiState(stage: SearchStage, embeddingStatus: EmbeddingServiceStatus): AiUiState | null {
  if (embeddingStatus.state === "error") {
    return { kind: "error", title: "AI 분석을 완료하지 못했습니다", description: "잠시 후 다시 시도해 주세요." };
  }
  if (stage === "embedding" && embeddingStatus.state === "loading") {
    return {
      kind: "loading-model",
      title: "CLIP 모델 다운로드 중",
      description: "처음 실행할 때만 모델을 준비합니다. 이 창을 닫지 말고 기다려 주세요.",
      progress: normalizeProgress(embeddingStatus.progress),
    };
  }
  if (stage === "embedding") {
    return { kind: "processing", title: "이미지 장면 분석 중", description: "사진의 장면 특징을 추출하고 있습니다." };
  }
  if (stage === "searching") {
    return { kind: "searching", title: "유사 장소 검색 중", description: "분석한 이미지 특징으로 장소 후보를 찾고 있습니다." };
  }
  return null;
}

function isInvalidImageError(message: string): boolean {
  const normalized = message.toLowerCase();
  return ["image file is empty", "image exceeds", "unsupported image type", "decoded image", "decode image", "invalid image", "corrupt image"].some((fragment) => normalized.includes(fragment));
}

function getSearchError(cause: unknown, stage: "embedding" | "searching", embeddingStatus: EmbeddingServiceStatus): SearchErrorState {
  const message = cause instanceof Error ? cause.message : "검색 중 알 수 없는 오류가 발생했습니다.";
  if (stage === "embedding" && isInvalidImageError(message)) {
    return { kind: "invalid-image", title: "이미지 파일을 확인해 주세요", description: "JPEG, PNG, WebP 형식과 파일 크기를 확인한 뒤 다른 이미지를 선택해 주세요.", retryable: false, detail: message };
  }
  if (cause instanceof SearchApiError) {
    if (cause.status === 503 || cause.code === "DATA_ACCESS_ERROR" || cause.code === "CONFIGURATION_ERROR") {
      return { kind: "database", title: "장소 데이터를 불러올 수 없습니다", description: "서비스 연결이 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.", retryable: true };
    }
    if (cause.status >= 500) {
      return { kind: "request", title: "검색 서버에서 오류가 발생했습니다", description: "일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.", retryable: true };
    }
    return { kind: "request", title: "검색 요청을 처리하지 못했습니다", description: "이미지와 검색 조건을 확인한 뒤 다시 시도해 주세요.", retryable: false, detail: message };
  }
  if (stage === "searching" && cause instanceof TypeError) {
    return { kind: "network", title: "네트워크 연결을 확인해 주세요", description: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.", retryable: true };
  }
  if (stage === "embedding" || embeddingStatus.state === "error") {
    return { kind: "model", title: "AI 모델을 준비하지 못했습니다", description: "모델을 다시 불러오도록 검색을 재시도해 주세요.", retryable: true };
  }
  return { kind: "request", title: "검색 중 오류가 발생했습니다", description: "잠시 후 다시 시도해 주세요.", retryable: true };
}

async function createSearchApiError(response: Response): Promise<SearchApiError> {
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = null; }
  const data = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const message = typeof data.error === "string" ? data.error : "검색 요청에 실패했습니다.";
  const code = typeof data.code === "string" ? data.code : undefined;
  return new SearchApiError(response.status, code, message);
}

function SearchResultsSkeleton() {
  return <div role="status" aria-live="polite" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
    <span className="sr-only">검색 결과를 불러오는 중입니다.</span>
    {Array.from({ length: 6 }, (_, index) => <div key={index} aria-hidden="true" className="scene-panel overflow-hidden animate-pulse">
      <div className="h-44 bg-stone-200" />
      <div className="space-y-3 p-4"><div className="h-5 w-3/4 rounded bg-stone-200" /><div className="h-4 w-1/2 rounded bg-stone-100" /><div className="h-4 w-full rounded bg-stone-100" /></div>
    </div>)}
  </div>;
}

export function SearchWorkspace({ examples }: { examples: Location[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [region, setRegion] = useState<Region | "">("");
  const [category, setCategory] = useState<LocationCategory | "">("");
  const [results, setResults] = useState<LocationSearchResult[] | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchStage, setSearchStage] = useState<SearchStage>("idle");
  const [searchError, setSearchError] = useState<SearchErrorState | null>(null);
  const embeddingService = useMemo(() => createImageEmbeddingService(), []);
  const [embeddingStatus, setEmbeddingStatus] = useState(() => embeddingService.getStatus());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInFlightRef = useRef(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => embeddingService.subscribe(setEmbeddingStatus), [embeddingService]);

  function selectFile(next: File | null) {
    if (!next) return;
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setSearchError(null);
    setResults(null);
    setActiveLocationId(null);
    setSearchStage("idle");
  }

  function removeFile() {
    setFile(null);
    setPreview(null);
    setSearchError(null);
    setResults(null);
    setActiveLocationId(null);
    setSearchStage("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearSearchResults() {
    setSearchError(null);
    setResults(null);
    setActiveLocationId(null);
    setSearchStage("idle");
  }

  function selectRegion(next: Region) {
    setRegion(region === next ? "" : next);
    clearSearchResults();
  }

  function selectCategory(next: LocationCategory) {
    setCategory(category === next ? "" : next);
    clearSearchResults();
  }

  function resetFilters() {
    setRegion("");
    setCategory("");
    clearSearchResults();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!busy) selectFile(event.dataTransfer.files.item(0));
  }

  function handleDropZoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }

  async function search() {
    if (searchInFlightRef.current) return;
    if (!file) {
      setSearchError({ kind: "missing-image", title: "레퍼런스 이미지를 선택해 주세요", description: "장면을 찾을 사진을 업로드한 뒤 검색을 시작할 수 있습니다.", retryable: false });
      return;
    }
    searchInFlightRef.current = true;
    setBusy(true);
    setSearchError(null);
    setResults(null);
    setActiveLocationId(null);
    setSearchStage("embedding");
    let executionStage: "embedding" | "searching" = "embedding";
    try {
      const embedding = await embeddingService.embed(file);
      executionStage = "searching";
      setSearchStage("searching");
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embedding, filters: { region: region || undefined, category: category || undefined } }) });
      if (!response.ok) throw await createSearchApiError(response);
      const data = await response.json() as SearchResponse;
      setResults(data.results);
      setSearchStage("complete");
    } catch (cause) {
      setSearchError(getSearchError(cause, executionStage, embeddingService.getStatus()));
      setSearchStage("idle");
    }
    finally {
      searchInFlightRef.current = false;
      setBusy(false);
    }
  }

  const aiUiState = getAiUiState(searchStage, embeddingStatus);
  const searchButtonText = searchStage === "searching" ? "장소 검색 중…" : "이미지 분석 중…";
  const displayedResults = useMemo(() => results?.slice(0, 8) ?? null, [results]);
  const hasActiveFilters = region !== "" || category !== "";

  return <div className="grid gap-8 lg:grid-cols-[290px_1fr]">
    <aside className="scene-panel h-fit p-5"><h2 className="text-lg font-semibold">레퍼런스 이미지</h2>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="레퍼런스 이미지 파일 선택"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          selectFile(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
      {preview && file ? <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
        <Image src={preview} alt="선택한 레퍼런스 이미지" width={520} height={360} unoptimized className="h-44 w-full object-contain" />
        <div className="border-t border-stone-200 bg-white p-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-stone-700"><FileImage size={16} aria-hidden="true" /><span className="truncate" title={file.name}>{file.name}</span></div>
          <p className="mt-1 text-xs text-stone-500">{(file.size / 1024 / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 1 })} MB</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" size="default" className="flex-1" disabled={busy} onClick={() => fileInputRef.current?.click()}><ImagePlus size={16} />교체</Button>
            <Button type="button" variant="outline" size="default" disabled={busy} aria-label="선택한 이미지 삭제" onClick={removeFile}><Trash2 size={16} />삭제</Button>
          </div>
        </div>
      </div> : <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="레퍼런스 이미지 업로드"
        aria-disabled={busy}
        onClick={() => !busy && fileInputRef.current?.click()}
        onKeyDown={handleDropZoneKeyDown}
        onDragEnter={(event) => { event.preventDefault(); if (!busy) setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`mt-4 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 ${isDragging ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-stone-300 bg-stone-50 text-stone-600"} ${busy ? "cursor-not-allowed opacity-60" : "hover:border-emerald-700 hover:bg-emerald-50"}`}
      >
        <Upload size={24} aria-hidden="true" />
        <p className="mt-3 font-semibold text-stone-800">이미지를 끌어놓거나 클릭해 선택</p>
        <p className="mt-1 text-xs">JPEG, PNG, WebP · 최대 15MB</p>
      </div>}
      <div className="mt-6 space-y-5 border-t border-stone-200 pt-5">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">검색 필터</h3><button type="button" disabled={busy || !hasActiveFilters} onClick={resetFilters} className="min-h-11 rounded-md px-2 text-xs font-semibold text-emerald-800 underline underline-offset-2 disabled:cursor-not-allowed disabled:text-stone-400">초기화</button></div>
        <fieldset disabled={busy}><legend className="text-sm font-medium text-stone-700">지역</legend><div className="mt-2 flex flex-wrap gap-2">{regionOptions.map((option) => { const selected = region === option; return <button key={option} type="button" aria-pressed={selected} onClick={() => selectRegion(option)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors ${selected ? "border-emerald-800 bg-emerald-800 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-emerald-700"} disabled:cursor-not-allowed disabled:opacity-60`}>{selected && <Check size={14} aria-hidden="true" />}{option}</button>; })}</div></fieldset>
        <fieldset disabled={busy}><legend className="text-sm font-medium text-stone-700">공간 종류</legend><div className="mt-2 flex flex-wrap gap-2">{categoryOptions.map((option) => { const selected = category === option.value; return <button key={option.value} type="button" aria-pressed={selected} onClick={() => selectCategory(option.value)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors ${selected ? "border-emerald-800 bg-emerald-800 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-emerald-700"} disabled:cursor-not-allowed disabled:opacity-60`}>{selected && <Check size={14} aria-hidden="true" />}{option.label}</button>; })}</div></fieldset>
      </div>
      <Button onClick={search} disabled={busy} aria-busy={busy} className="mt-6 w-full">
        {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
        {busy ? searchButtonText : results ? "다시 검색하기" : "비슷한 장소 찾기"}
      </Button>
      {aiUiState && aiUiState.kind !== "error" && <div role="status" aria-live="polite" className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-emerald-950">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{aiUiState.title}</p>{aiUiState.progress !== undefined && <span className="text-sm font-semibold tabular-nums">{aiUiState.progress}%</span>}</div>
        <p className="mt-1 text-xs leading-relaxed opacity-80">{aiUiState.description}</p>
        <div role="progressbar" aria-label={aiUiState.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={aiUiState.progress} className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
          <div className={`h-full rounded-full bg-emerald-700 ${aiUiState.progress === undefined ? "w-2/3 animate-pulse" : "transition-[width] duration-300"}`} style={aiUiState.progress === undefined ? undefined : { width: `${aiUiState.progress}%` }} />
        </div>
      </div>}
      {!busy && searchStage === "complete" && <p role="status" className="mt-3 text-sm text-emerald-800">검색이 완료되었습니다. {displayedResults?.length ?? 0}곳을 찾았습니다.</p>}
      {searchError && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900"><p className="text-sm font-semibold">{searchError.title}</p><p className="mt-1 text-xs leading-relaxed text-red-800">{searchError.description}</p>{searchError.detail && <p className="mt-2 text-xs text-red-700">{searchError.detail}</p>}{searchError.retryable && <Button type="button" variant="outline" size="default" disabled={busy} onClick={search} className="mt-3 border-red-200 bg-white text-red-900 hover:bg-red-100">재시도</Button>}</div>}
      <p className="mt-4 text-xs leading-relaxed text-stone-500">{searchModeDescription}</p>
    </aside>
    <section aria-busy={busy}><div className="mb-5 flex items-end justify-between"><div><p className="scene-label">MATCHES</p><h2 className="mt-1 text-2xl font-bold">{busy ? "장소 검색 중" : searchError ? "검색 오류" : displayedResults ? "Top 8 Locations" : "예시 장소"}</h2></div><span className="text-sm text-stone-500">{busy ? "검색 중" : searchError ? "결과 없음" : `${displayedResults?.length ?? examples.length}곳`}</span></div>
      {busy ? (
        <SearchResultsSkeleton />
      ) : searchError ? (
        <div className="scene-panel p-8 text-center text-stone-600">
          <h3 className="text-lg font-semibold text-stone-900">
            검색 결과를 표시할 수 없습니다
          </h3>
          <p className="mt-2 text-sm">
            왼쪽 안내를 확인한 뒤 다시 검색해 주세요.
          </p>
        </div>
      ) : displayedResults?.length === 0 ? (
        <div className="scene-panel p-8 text-center text-stone-600">
          <h3 className="text-lg font-semibold text-stone-900">
            조건에 맞는 장소를 찾지 못했습니다
          </h3>
          <p className="mt-2 text-sm">
            다른 레퍼런스 이미지를 사용하거나 검색 필터를 조정해 보세요.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 min-h-11 rounded-md px-3 text-sm font-semibold text-emerald-800 underline underline-offset-2"
            >
              필터 초기화
            </button>
          )}
        </div>
      ) : displayedResults ? (
        <div className="space-y-5">
          <SearchResultsMap
            results={displayedResults}
            activeLocationId={activeLocationId}
            onMarkerActivate={setActiveLocationId}
          />
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {displayedResults.map(({ location, similarity }, index) => (
              <LocationCard
                key={location.id}
                location={location}
                similarity={similarity}
                rank={index + 1}
                eager={index < 3}
                highlighted={activeLocationId === location.id}
                onHighlightChange={(highlighted) =>
                  setActiveLocationId((current) =>
                    highlighted
                      ? location.id
                      : current === location.id
                        ? null
                        : current,
                  )
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {examples.map((location, index) => (
            <LocationCard key={location.id} location={location} eager={index < 3} />
          ))}
        </div>
      )}
    </section>
  </div>;
}
