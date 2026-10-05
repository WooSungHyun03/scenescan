"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import { FileImage, ImagePlus, LoaderCircle, Search, Trash2, Upload, MapPinned, LayoutGrid, ArrowDown } from "lucide-react";
import { publicEnv } from "@/env/public";
import { LocationCard } from "@/domains/locations/components/location-card";
import { SearchResultsMap } from "@/domains/locations/components/search-results-map";
import { createImageEmbeddingService, type EmbeddingServiceStatus } from "@/lib/ai";
import { Button } from "@/shared/ui/button";
import type { Location, LocationCategory, LocationSearchResult, Region } from "@/types/domain";
import { validateImageBlob } from "@/lib/ai/image-validation";
import { getSearchSession, setSearchSession, takeSearchImageDraft } from "./search-image-draft";
import { REGION_VALUES } from "@/types/location-options";
import type { SearchResponse } from "@/types/contracts";

const searchModeDescription = publicEnv.useMockData
  ? "샘플 장소 카탈로그에서는 유사도를 참고용 값으로 표시합니다."
  : "사진은 기기에서 분석하며 서버에 저장하지 않습니다.";

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
    return { kind: "error", title: "이미지를 분석하지 못했습니다", description: "잠시 후 다시 시도해 주세요." };
  }
  if (stage === "embedding" && embeddingStatus.state === "loading") {
    return {
      kind: "loading-model",
      title: "이미지 분석 준비 중…",
      description: "첫 검색에는 준비 시간이 걸릴 수 있어요. 다운로드가 끝나면 사진 분석을 시작합니다.",
      progress: normalizeProgress(embeddingStatus.progress),
    };
  }
  if (stage === "embedding") {
    return { kind: "processing", title: "사진의 특징을 분석하고 있어요…", description: "사진의 장면 특징을 추출하고 있습니다." };
  }
  if (stage === "searching") {
    return { kind: "searching", title: "비슷한 촬영 장소를 찾고 있어요…", description: "분석한 이미지 특징으로 장소 후보를 찾고 있습니다." };
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
    return {
      kind: "model",
      title: "이미지 분석을 준비하지 못했습니다",
      description: "인터넷 연결을 확인하고 다시 검색해 주세요.",
      retryable: true,
      detail: message,
    };
  }
  return { kind: "request", title: "검색 중 오류가 발생했습니다", description: "잠시 후 다시 시도해 주세요.", retryable: true };
}

async function createSearchApiError(response: Response): Promise<SearchApiError> {
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = null; }
  const data = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const error = typeof data.error === "object" && data.error !== null ? data.error as Record<string, unknown> : data;
  const message = typeof error.message === "string" ? error.message : typeof data.error === "string" ? data.error : "검색 요청에 실패했습니다.";
  const code = typeof error.code === "string" ? error.code : undefined;
  return new SearchApiError(response.status, code, message);
}

function SearchResultsSkeleton() {
  return <div role="status" aria-live="polite" aria-busy="true" className="grid gap-5 sm:grid-cols-2">
    <span className="sr-only">검색 결과를 불러오는 중입니다.</span>
    {Array.from({ length: 6 }, (_, index) => <div key={index} aria-hidden="true" className="scene-panel overflow-hidden">
      <div className="scene-skeleton aspect-[3/2]" />
      <div className="space-y-3 p-5"><div className="scene-skeleton h-5 w-3/4 rounded" /><div className="scene-skeleton h-4 w-1/2 rounded" /><div className="scene-skeleton h-4 w-full rounded" /></div>
    </div>)}
  </div>;
}

export function SearchWorkspace({ examples }: { examples: Location[] }) {
  const [file, setFile] = useState<File | null>(() => getSearchSession()?.file ?? null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [region, setRegion] = useState<Region | "">(() => getSearchSession()?.region ?? "");
  const [category, setCategory] = useState<LocationCategory | "">(() => getSearchSession()?.category ?? "");
  const [results, setResults] = useState<LocationSearchResult[] | null>(() => getSearchSession()?.results ?? null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [view, setView] = useState<"photos" | "map">("photos");
  const [visibleCount, setVisibleCount] = useState(12);
  const [catalog, setCatalog] = useState({ key: "|", locations: examples, hasMore: examples.length === 20 });
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogOffset, setCatalogOffset] = useState(0);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchStage, setSearchStage] = useState<SearchStage>("idle");
  const [searchError, setSearchError] = useState<SearchErrorState | null>(null);
  const embeddingService = useMemo(() => createImageEmbeddingService(), []);
  const [embeddingStatus, setEmbeddingStatus] = useState(() => embeddingService.getStatus());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInFlightRef = useRef(false);
  const analyzedImageRef = useRef<{ file: File; embedding: number[] } | null>(null);
  const filterKey = `${region}|${category}`;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "20", offset: String(catalogOffset) });
    if (region) params.set("region", region);
    if (category) params.set("category", category);
    const frame = requestAnimationFrame(() => { setCatalogLoading(true); setCatalogError(null); });
    void fetch(`/api/locations?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(async (response) => {
        if (!response.ok) throw new Error("장소 목록을 불러오지 못했습니다.");
        const data = await response.json();
        if (!Array.isArray(data.locations)) throw new Error("장소 목록 응답이 올바르지 않습니다.");
        if (controller.signal.aborted) return;
        setCatalog((current) => ({ key: filterKey, locations: catalogOffset && current.key === filterKey ? [...current.locations, ...data.locations] : data.locations, hasMore: data.locations.length === 20 }));
      })
      .catch(() => { if (!controller.signal.aborted) setCatalogError("장소 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."); })
      .finally(() => { cancelAnimationFrame(frame); if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => { cancelAnimationFrame(frame); controller.abort(); };
  }, [region, category, catalogOffset, filterKey]);

  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : null;
    const frame = requestAnimationFrame(() => setPreview(url));
    return () => {
      cancelAnimationFrame(frame);
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => embeddingService.subscribe(setEmbeddingStatus), [embeddingService]);
  useEffect(() => { setSearchSession({ file, region, category, results }); }, [file, region, category, results]);

  useEffect(() => {
    const draft = takeSearchImageDraft();
    if (draft) selectFile(draft);
    return () => requestRef.current?.abort();
  }, []);

  function selectFile(next: File | null) {
    if (!next) return;
    try { validateImageBlob(next); } catch {
      setSearchError({ kind: "invalid-image", title: "사진을 선택할 수 없습니다", description: next.size === 0 ? "빈 파일입니다. 다른 사진을 선택해 주세요." : "15MB 이하의 JPEG, PNG, WebP 사진을 선택해 주세요.", retryable: false });
      return;
    }
    setFile(next);
    analyzedImageRef.current = null;
    setSearchError(null);
    setResults(null);
    setActiveLocationId(null);
    setSearchStage("idle");
  }

  function removeFile() {
    analyzedImageRef.current = null;
    setFile(null);
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

  function resetFilters() {
    setCatalogOffset(0);
    setRegion("");
    setCategory("");
    clearSearchResults();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!busy) selectFile(event.dataTransfer.files.item(0));
  }

  async function search() {
    if (searchInFlightRef.current) return;
    if (!file) {
      setSearchError({ kind: "missing-image", title: "참고 이미지를 선택해 주세요", description: "장면을 찾을 사진을 업로드한 뒤 검색을 시작할 수 있습니다.", retryable: false });
      return;
    }
    // Avoid a model download for a known-empty catalog filter. Never broaden
    // the requested region/category silently or substitute invented places.
    if (catalog.key === filterKey && !catalogLoading && !catalogError && !catalog.hasMore && catalog.locations.length === 0) {
      setSearchError(null);
      setResults([]);
      setSearchStage("complete");
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    searchInFlightRef.current = true;
    setBusy(true);
    setSearchError(null);
    setResults(null);
    setActiveLocationId(null);
    const cached = analyzedImageRef.current?.file === file ? analyzedImageRef.current.embedding : null;
    setSearchStage(cached ? "searching" : "embedding");
    let executionStage: "embedding" | "searching" = "embedding";
    try {
      const embedding = cached ?? await embeddingService.embed(file, { signal: controller.signal });
      if (controller.signal.aborted) return;
      analyzedImageRef.current = { file, embedding };
      executionStage = "searching";
      setSearchStage("searching");
      const response = await fetch("/api/search", { method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embedding, filters: { region: region || undefined, category: category || undefined } }) });
      if (!response.ok) throw await createSearchApiError(response);
      const data = await response.json() as SearchResponse;
      if (!Array.isArray(data.results)) throw new Error("Invalid search response");
      setResults(data.results);
      setView("photos");
      requestAnimationFrame(() => { resultHeadingRef.current?.focus({ preventScroll: true }); if (window.matchMedia("(max-width: 1023px)").matches) resultHeadingRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); });
      setSearchStage("complete");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setSearchError(getSearchError(cause, executionStage, embeddingService.getStatus()));
      setSearchStage("idle");
    }
    finally {
      if (requestRef.current === controller) requestRef.current = null;
      searchInFlightRef.current = false;
      setBusy(false);
    }
  }

  const aiUiState = getAiUiState(searchStage, embeddingStatus);
  const searchButtonText = searchStage === "searching" ? "장소 검색 중…" : "이미지 분석 중…";
  const displayedResults = useMemo(() => results?.slice(0, 8) ?? null, [results]);
  const hasActiveFilters = region !== "" || category !== "";

  const filteredExamples = catalog.key === filterKey ? catalog.locations : [];
  const activeResult = displayedResults?.find(({ location }) => location.id === activeLocationId);
  return <div className="grid items-start gap-8 lg:grid-cols-[340px_minmax(0,1fr)] xl:gap-10">
    <aside id="reference-image" className="scene-panel search-reference p-4 sm:p-5" aria-labelledby="reference-image-title">
      <p className="scene-kicker">Search input</p>
      <h2 id="reference-image-title" className="mt-2 text-xl font-bold">참고 이미지</h2>
      <p className="mt-1 text-sm text-muted">찾고 싶은 장면의 사진과 검색 조건을 준비하세요.</p>
      <input ref={fileInputRef} type="file" name="reference-image" accept="image/jpeg,image/png,image/webp" aria-label="참고 이미지 파일 선택" className="sr-only" disabled={busy} onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
      {preview && file ? <div className="mt-4">
        <div className="overflow-hidden rounded-[var(--radius-media)] border border-line bg-stone-100"><Image src={preview} alt="선택한 참고 이미지" width={520} height={360} unoptimized className="h-48 w-full object-contain lg:h-56" /></div>
        <div className="mt-3 flex min-w-0 items-center gap-2 text-sm text-muted"><FileImage size={16} className="shrink-0" aria-hidden="true" /><span className="truncate" title={file.name}>{file.name}</span><span className="ml-auto shrink-0 text-xs">{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 1 })} MB`}</span></div>
        <div className="mt-3 flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => fileInputRef.current?.click()}><ImagePlus size={16} aria-hidden="true" />다른 사진 선택</Button><Button type="button" variant="outline" disabled={busy} aria-label="선택한 이미지 삭제" onClick={removeFile}><Trash2 size={16} aria-hidden="true" /></Button></div>
      </div> : <div onDragEnter={(event) => { event.preventDefault(); if (!busy) setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
        <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} className={`mt-4 flex min-h-52 w-full flex-col items-center justify-center rounded-[var(--radius-media)] border border-dashed p-5 text-center transition-colors ${isDragging ? "border-brand bg-brand-soft" : "border-stone-300 bg-stone-50 hover:border-brand hover:bg-brand-soft"}`}>
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand"><Upload size={24} aria-hidden="true" /></span><span className="mt-3 font-bold">참고 이미지 업로드</span><span className="mt-2 text-xs text-muted">선택하거나 끌어놓기 · JPEG, PNG, WebP · 최대 15MB</span>
        </button>
      </div>}
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">검색 조건 <span className="font-normal text-muted">(선택)</span></h3><button type="button" disabled={busy || !hasActiveFilters} onClick={resetFilters} className="min-h-11 px-2 text-sm font-semibold text-brand disabled:text-stone-400">초기화</button></div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
          <label className="text-sm font-medium">지역<select name="region" className="scene-input mt-2" value={region} disabled={busy} onChange={(e) => { setRegion(e.target.value as Region | ""); setCatalogOffset(0); clearSearchResults(); setVisibleCount(12); }}><option value="">전국</option>{regionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="text-sm font-medium">공간 종류<select name="category" className="scene-input mt-2" value={category} disabled={busy} onChange={(e) => { setCategory(e.target.value as LocationCategory | ""); setCatalogOffset(0); clearSearchResults(); setVisibleCount(12); }}><option value="">전체</option>{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">{region || "전국"} · {categoryOptions.find((option) => option.value === category)?.label ?? "전체 공간"}{catalogLoading || catalog.key !== filterKey ? " — 장소 목록 확인 중…" : catalogError ? " — 목록 연결을 확인해 주세요. 이미지 검색은 계속 사용할 수 있습니다." : catalog.hasMore ? ` — 장소 ${filteredExamples.length}곳을 불러왔습니다. 아래에서 더 볼 수 있어요.` : `에 등록된 장소 ${filteredExamples.length}곳.`}</p>
      </div>
      <Button onClick={search} disabled={busy} aria-busy={busy} size="lg" className="mt-5 w-full">{busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}{busy ? searchButtonText : results ? "다시 검색하기" : "이 이미지로 장소 찾기"}</Button>
      {aiUiState && aiUiState.kind !== "error" && <div role="status" aria-live="polite" className="scene-status mt-4" data-tone="progress">
        <p className="text-sm font-semibold">{aiUiState.title}</p><p className="mt-2 text-sm leading-relaxed">{aiUiState.description}</p>
        {aiUiState.progress !== undefined && <><div className="mt-3 flex justify-between text-xs"><span>분석 도구 다운로드</span><span className="tabular-nums">{aiUiState.progress}%</span></div><progress aria-label="분석 도구 다운로드" value={aiUiState.progress} max={100} className="mt-1 h-2 w-full accent-emerald-800" /></>}
      </div>}
      {!busy && searchStage === "complete" && <p role="status" className="scene-status mt-3 text-sm font-semibold" data-tone="success">검색 완료 · 촬영 후보 {displayedResults?.length ?? 0}곳을 찾았습니다.</p>}
      {searchError && <div role="alert" className="scene-status mt-4" data-tone="error"><p className="text-sm font-bold">{searchError.title}</p><p className="mt-2 text-sm leading-relaxed">{searchError.description}</p>{searchError.detail && <p className="mt-2 break-words text-xs">오류 정보: {searchError.detail}</p>}{searchError.retryable && <Button type="button" variant="outline" disabled={busy} onClick={search} className="mt-3">다시 시도</Button>}</div>}
      <p className="mt-4 text-xs leading-relaxed text-muted">{searchModeDescription}</p>
    </aside>
    <section className="min-w-0" aria-busy={busy} aria-labelledby="search-results-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div><p className="scene-kicker">Results</p><h2 ref={resultHeadingRef} tabIndex={-1} id="search-results-title" className="mt-2 scroll-mt-24 text-2xl font-extrabold sm:text-3xl">{busy ? "촬영 장소를 찾고 있어요" : searchError ? "검색을 다시 시도해 주세요" : displayedResults ? `추천 장소 ${displayedResults.length}곳` : "촬영 장소 둘러보기"}</h2><p className="mt-2 text-sm text-muted">{displayedResults ? "참고 이미지와 사진을 비교하고, 마음에 드는 장소를 저장하세요." : `등록된 ${filteredExamples.length}곳 · 사진을 선택하면 비슷한 장소를 찾아드려요.`}</p></div>
        {!!displayedResults?.length && <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-white p-1 shadow-sm" role="group" aria-label="검색 결과 보기 방식">{([{value:"photos", label:"사진", Icon:LayoutGrid}, {value:"map",label:"지도",Icon:MapPinned}] as const).map(({value,label,Icon}) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-bold ${view === value ? "bg-brand text-white" : "text-muted hover:bg-brand-soft"}`}><Icon size={16} aria-hidden="true" />{label}</button>)}</div>}
      </div>
      {preview && displayedResults && <div className="sticky top-[var(--header-height)] z-30 mb-5 flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-white/95 p-3 shadow-[var(--shadow-panel)] backdrop-blur lg:hidden"><Image src={preview} alt="검색에 사용한 참고 이미지" width={64} height={48} unoptimized className="h-12 w-16 rounded-md object-contain bg-stone-100" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">참고 이미지와 비교하세요</p><a href="#reference-image" className="inline-flex min-h-11 items-center text-sm font-bold text-brand">사진·검색 조건 변경</a></div></div>}
      {busy ? <SearchResultsSkeleton /> : searchError ? <div className="scene-empty"><h3 className="text-lg font-semibold">검색 결과를 표시할 수 없습니다</h3><p className="mt-2 text-sm text-muted">이미지와 연결 상태를 확인한 뒤 다시 시도해 주세요.</p></div> : displayedResults?.length === 0 ? <div className="scene-empty"><Search size={28} className="mx-auto text-muted" aria-hidden="true" /><h3 className="mt-4 text-lg font-semibold">조건에 맞는 장소가 없습니다</h3><p className="mt-2 text-sm text-muted">다른 사진을 선택하거나 지역·공간 조건을 넓혀보세요.</p>{hasActiveFilters && <Button variant="outline" onClick={resetFilters} className="mt-5">검색 조건 초기화</Button>}</div> : displayedResults ? <div className="space-y-6">
        {view === "map" ? <><SearchResultsMap results={displayedResults} activeLocationId={activeLocationId} onMarkerActivate={setActiveLocationId} />{activeResult && <div className="max-w-lg"><LocationCard location={activeResult.location} similarity={activeResult.similarity} matchedImageId={activeResult.matchedImageId} highlighted /></div>}</> :
        <div className="scene-grid grid gap-5 sm:grid-cols-2 sm:gap-6">{displayedResults.map(({location,similarity,matchedImageId},index) => <LocationCard key={location.id} location={location} similarity={similarity} matchedImageId={matchedImageId} rank={index+1} eager={index < 2} highlighted={activeLocationId === location.id} onHighlightChange={(highlighted) => { if (highlighted) setActiveLocationId(location.id); }} />)}</div>}
      </div> : <><div className="scene-grid grid gap-5 sm:grid-cols-2 sm:gap-6">{filteredExamples.slice(0,visibleCount).map((location,index) => <LocationCard key={location.id} location={location} eager={index < 2} />)}</div>{catalogLoading && <p role="status" className="mt-4 text-sm text-muted">장소 목록을 불러오는 중입니다.</p>}{catalogError && <p role="alert" className="mt-4 text-sm text-red-800">{catalogError}</p>}{!filteredExamples.length && !catalogLoading && !catalogError && catalog.key === filterKey && <div className="scene-empty"><p>이 조건에 등록된 장소가 없습니다.</p><Button variant="outline" onClick={resetFilters} className="mt-4">전체 장소 보기</Button></div>}{(filteredExamples.length > visibleCount || catalog.hasMore) && <div className="mt-8 text-center"><Button variant="outline" disabled={catalogLoading} onClick={() => { setVisibleCount((count) => count + 20); if (visibleCount >= filteredExamples.length) setCatalogOffset(filteredExamples.length); }}><ArrowDown size={16} aria-hidden="true" />장소 더 보기</Button><p className="mt-2 text-xs text-muted">{Math.min(visibleCount,filteredExamples.length)}곳 표시 중</p></div>}</>}
    </section>
  </div>;
}
