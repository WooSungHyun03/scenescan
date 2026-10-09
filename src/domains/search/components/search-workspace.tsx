"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import { AlertTriangle, FileImage, ImagePlus, Info, LoaderCircle, MessageSquareText, Search, Tags, Trash2, Upload, MapPinned, LayoutGrid, ArrowDown } from "lucide-react";
import { publicEnv } from "@/env/public";
import { LocationCard } from "@/domains/locations/components/location-card";
import { SearchResultsMap } from "@/domains/locations/components/search-results-map";
import { createImageEmbeddingService, type EmbeddingServiceStatus, type ImageEmbeddingService } from "@/lib/ai";
import { Button } from "@/shared/ui/button";
import type { District, Location, LocationCategory, LocationSearchResult } from "@/types/domain";
import { validateImageBlob } from "@/lib/ai/image-validation";
import { getSearchSession, setSearchSession, takeSearchImageDraft, type SearchMode, type TextSearchSessionState } from "./search-image-draft";
import { DISTRICT_LABELS, DISTRICT_VALUES } from "@/types/location-options";
import type { SearchResponse } from "@/types/contracts";
import type { TextSearchMatchField, TextSearchMatchReason, TextSearchResponse } from "@/types/text-search";
import { useUploadReady } from "./use-upload-ready";

const searchModeDescription = publicEnv.useMockData
  ? "샘플 장소 카탈로그에서는 유사도를 참고용 값으로 표시합니다."
  : "사진은 기기에서 분석하며 서버에 저장하지 않습니다.";
const textSearchFooterDescription = "검색어는 부산 장소의 이름·별칭·설명·태그와 비교하는 데만 사용되며, 이미지 분석 도구는 불러오지 않습니다.";

// 부산 16개 구·군 -- src/types/location-options.ts의 단일 정의를 그대로 사용한다.
const districtOptions: { value: District; label: string }[] = DISTRICT_VALUES.map((value) => ({ value, label: DISTRICT_LABELS[value] }));
const districtValueSet = new Set<string>(DISTRICT_VALUES);
// Defensive: a session object created before this change (or any other
// stale caller) could still carry a nationwide region string in what used
// to be the `region` field. Never trust it as a district value.
function toValidDistrict(value: string | undefined): District | "" {
  return value && districtValueSet.has(value) ? (value as District) : "";
}
const categoryOptions: { value: LocationCategory; label: string }[] = [
  { value: "urban", label: "도시" },
  { value: "nature", label: "자연" },
  { value: "industrial", label: "산업" },
  { value: "interior", label: "실내" },
];
const matchFieldLabels: Record<TextSearchMatchField, string> = {
  name: "이름", alias: "별칭", description: "설명", tag: "태그",
};
const EMPTY_TEXT_SESSION: TextSearchSessionState = {
  query: "", results: null, parsedQuery: null, unsupportedConditions: [], notice: null,
};
const TEXT_SEARCH_QUERY_MAX_LENGTH = 200;

type SearchStage = "idle" | "embedding" | "searching" | "complete";

type AiUiState = {
  kind: "loading-model" | "processing" | "searching" | "error";
  title: string;
  description: string;
  progress?: number;
};

type SearchErrorKind = "missing-image" | "missing-query" | "invalid-image" | "model" | "network" | "database" | "request";

type SearchErrorState = {
  kind: SearchErrorKind;
  title: string;
  description: string;
  retryable: boolean;
  detail?: string;
};

// Normalizes an image-search hit (similarity + matchedImageId) and a
// text-search hit (score + matchedOn) into one shape so the results
// grid/map/empty/skeleton JSX below reads from a single `displayedResults`
// regardless of mode (requirement: reuse the existing card/map, never mix
// one mode's fields into the other's display -- LocationCard already omits
// its similarity badge whenever `similarity` is undefined, so a text
// result simply never gets one).
type DisplayResult = {
  location: Location;
  similarity?: number;
  matchedImageId?: string;
  matchedOn?: TextSearchMatchReason[];
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

function getTextSearchError(cause: unknown): SearchErrorState {
  const message = cause instanceof Error ? cause.message : "검색 중 알 수 없는 오류가 발생했습니다.";
  if (cause instanceof SearchApiError) {
    if (cause.status === 503 || cause.code === "DATA_ACCESS_ERROR" || cause.code === "CONFIGURATION_ERROR") {
      return { kind: "database", title: "장소 데이터를 불러올 수 없습니다", description: "서비스 연결이 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.", retryable: true };
    }
    if (cause.status >= 500) {
      return { kind: "request", title: "검색 서버에서 오류가 발생했습니다", description: "일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.", retryable: true };
    }
    return { kind: "request", title: "검색 요청을 처리하지 못했습니다", description: "검색어를 확인한 뒤 다시 시도해 주세요.", retryable: false, detail: message };
  }
  if (cause instanceof TypeError) {
    return { kind: "network", title: "네트워크 연결을 확인해 주세요", description: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.", retryable: true };
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

// Local presentational helper, not a new card: shows which keyword matched
// which field (name/alias/description/tag) underneath the existing
// LocationCard, so a text result never borrows image search's similarity
// badge to express its own, differently-shaped confidence signal.
function TextMatchBadges({ reasons }: { reasons: TextSearchMatchReason[] | undefined }) {
  if (!reasons || reasons.length === 0) return null;
  return <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
    <Tags size={13} className="shrink-0 text-brand" aria-hidden="true" />
    <span className="sr-only">일치한 검색어:</span>
    {reasons.map((reason, index) => (
      <span key={`${reason.field}-${reason.keyword}-${index}`} className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand">
        {matchFieldLabels[reason.field]} &ldquo;{reason.keyword}&rdquo;
      </span>
    ))}
  </p>;
}

export function SearchWorkspace({ examples }: { examples: Location[] }) {
  const uploadReady = useUploadReady();
  const [mode, setMode] = useState<SearchMode>(() => getSearchSession()?.mode ?? "image");

  // --- image mode state (unchanged behavior/contract from before this ticket) ---
  const [file, setFile] = useState<File | null>(() => getSearchSession()?.file ?? null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [district, setDistrict] = useState<District | "">(() => toValidDistrict(getSearchSession()?.district));
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
  // Lazy, sticky: only ever instantiates the CLIP Worker singleton once
  // image mode has actually been active at least once. A page load (or
  // restored session) that starts in text mode must never load the model --
  // createImageEmbeddingService() is not even called until this flips true.
  // Set directly at each place `mode` can become "image" (switchMode below,
  // and the draft-pickup effect) rather than derived via its own effect, so
  // there is no separate effect whose only job is calling setState.
  const [imageModeActivated, setImageModeActivated] = useState(mode === "image");
  const embeddingService = useMemo<ImageEmbeddingService | null>(
    () => (imageModeActivated ? createImageEmbeddingService() : null),
    [imageModeActivated],
  );
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingServiceStatus>({ state: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInFlightRef = useRef(false);
  const analyzedImageRef = useRef<{ file: File; embedding: number[] } | null>(null);
  const filterKey = `${district}|${category}`;

  // --- text mode state (new; fully separate from image mode's own state) ---
  const [query, setQuery] = useState(() => getSearchSession()?.text.query ?? EMPTY_TEXT_SESSION.query);
  const [textResults, setTextResults] = useState<TextSearchSessionState["results"]>(() => getSearchSession()?.text.results ?? EMPTY_TEXT_SESSION.results);
  const [textParsedQuery, setTextParsedQuery] = useState<TextSearchSessionState["parsedQuery"]>(() => getSearchSession()?.text.parsedQuery ?? EMPTY_TEXT_SESSION.parsedQuery);
  const [textUnsupportedConditions, setTextUnsupportedConditions] = useState<string[]>(() => getSearchSession()?.text.unsupportedConditions ?? EMPTY_TEXT_SESSION.unsupportedConditions);
  const [textNotice, setTextNotice] = useState<TextSearchSessionState["notice"]>(() => getSearchSession()?.text.notice ?? EMPTY_TEXT_SESSION.notice);
  const [textBusy, setTextBusy] = useState(false);
  const [textError, setTextError] = useState<SearchErrorState | null>(null);
  const textRequestRef = useRef<AbortController | null>(null);
  const textSearchInFlightRef = useRef(false);

  const isBusy = mode === "image" ? busy : textBusy;
  const activeError = mode === "image" ? searchError : textError;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "20", offset: String(catalogOffset) });
    if (district) params.set("district", district);
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
  }, [district, category, catalogOffset, filterKey]);

  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : null;
    const frame = requestAnimationFrame(() => setPreview(url));
    return () => {
      cancelAnimationFrame(frame);
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => {
    if (!embeddingService) return;
    // subscribe() itself invokes the listener once, synchronously, with
    // the current status -- no separate setState call needed here.
    return embeddingService.subscribe(setEmbeddingStatus);
  }, [embeddingService]);
  useEffect(() => {
    setSearchSession({
      mode, file, district, category, results,
      text: { query, results: textResults, parsedQuery: textParsedQuery, unsupportedConditions: textUnsupportedConditions, notice: textNotice },
    });
  }, [mode, file, district, category, results, query, textResults, textParsedQuery, textUnsupportedConditions, textNotice]);

  useEffect(() => {
    selectFile(takeSearchImageDraft());
    return () => {
      requestRef.current?.abort();
      textRequestRef.current?.abort();
    };
  }, []);

  function selectFile(next: File | null) {
    if (!next) return;
    // Choosing a file is always an image-mode action, including when it
    // arrives via the home page's draft handoff before the user has ever
    // touched the mode toggle -- see activateImageModeWithDraft's only
    // caller, the mount effect below.
    setMode("image");
    setImageModeActivated(true);
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

  function clearImageResults() {
    setSearchError(null);
    setResults(null);
    setActiveLocationId(null);
    setSearchStage("idle");
  }

  function clearTextResults() {
    setTextError(null);
    setTextResults(null);
    setTextParsedQuery(null);
    setTextUnsupportedConditions([]);
    setTextNotice(null);
    setActiveLocationId(null);
  }

  // Whichever mode is active -- used so a district/category change never
  // leaves a stale result from the mode currently on screen (requirement:
  // invalidate instead of showing stale results).
  function clearActiveResults() {
    if (mode === "image") clearImageResults(); else clearTextResults();
  }

  function switchMode(next: SearchMode) {
    if (next === mode || isBusy) return;
    setMode(next);
    if (next === "image") setImageModeActivated(true);
    setActiveLocationId(null);
    setView("photos");
    // Each mode's own input/results are left exactly as they were -- only
    // visibility changes, so switching back shows what was already there,
    // and neither mode's results are ever shown while the other is active.
  }

  function resetFilters() {
    setCatalogOffset(0);
    setDistrict("");
    setCategory("");
    clearActiveResults();
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
    // the requested district/category silently or substitute invented places.
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
      const service = embeddingService ?? createImageEmbeddingService();
      const embedding = cached ?? await service.embed(file, { signal: controller.signal });
      if (controller.signal.aborted) return;
      analyzedImageRef.current = { file, embedding };
      executionStage = "searching";
      setSearchStage("searching");
      const response = await fetch("/api/search", { method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embedding, filters: { district: district || undefined, category: category || undefined } }) });
      if (!response.ok) throw await createSearchApiError(response);
      const data = await response.json() as SearchResponse;
      if (!Array.isArray(data.results)) throw new Error("Invalid search response");
      // A late reply from a superseded request can never land here: the
      // single-flight guard above means a second search() cannot start
      // while this one is still in flight, so there is no newer request
      // whose result this could clobber.
      setResults(data.results);
      setView("photos");
      requestAnimationFrame(() => { resultHeadingRef.current?.focus({ preventScroll: true }); if (window.matchMedia("(max-width: 1023px)").matches) resultHeadingRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); });
      setSearchStage("complete");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setSearchError(getSearchError(cause, executionStage, embeddingService?.getStatus() ?? { state: "idle" }));
      setSearchStage("idle");
    }
    finally {
      if (requestRef.current === controller) requestRef.current = null;
      searchInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function searchText() {
    if (textSearchInFlightRef.current) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setTextError({ kind: "missing-query", title: "검색어를 입력해 주세요", description: "찾고 싶은 장소를 문장으로 설명한 뒤 검색할 수 있습니다.", retryable: false });
      return;
    }
    const controller = new AbortController();
    textRequestRef.current = controller;
    textSearchInFlightRef.current = true;
    setTextBusy(true);
    setTextError(null);
    setTextResults(null);
    setTextParsedQuery(null);
    setTextUnsupportedConditions([]);
    setTextNotice(null);
    setActiveLocationId(null);
    try {
      // Sends the same district/category the user picked in "검색 조건" above
      // alongside the query text -- the server resolves any conflict between
      // the two (filter wins) and reports it via `notice`, see
      // resolveTextSearchFilters (src/domains/search/server/text-search-filter-resolution.ts).
      const response = await fetch("/api/search/text", { method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: trimmed, filters: { district: district || undefined, category: category || undefined } }) });
      if (!response.ok) throw await createSearchApiError(response);
      const data = await response.json() as TextSearchResponse;
      if (!Array.isArray(data.results)) throw new Error("Invalid search response");
      // Same single-flight guard as image search() -- a second searchText()
      // call cannot start while this one is in flight, so a late reply from
      // a superseded request can never overwrite a newer result here.
      setTextResults(data.results);
      setTextParsedQuery(data.parsedQuery);
      setTextUnsupportedConditions(data.unsupportedConditions);
      setTextNotice(data.notice);
      setView("photos");
      requestAnimationFrame(() => { resultHeadingRef.current?.focus({ preventScroll: true }); if (window.matchMedia("(max-width: 1023px)").matches) resultHeadingRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setTextError(getTextSearchError(cause));
    } finally {
      if (textRequestRef.current === controller) textRequestRef.current = null;
      textSearchInFlightRef.current = false;
      setTextBusy(false);
    }
  }

  const aiUiState = mode === "image" ? getAiUiState(searchStage, embeddingStatus) : null;
  const searchButtonText = searchStage === "searching" ? "장소 검색 중…" : "이미지 분석 중…";
  const hasActiveFilters = district !== "" || category !== "";
  const filteredExamples = catalog.key === filterKey ? catalog.locations : [];

  const displayedResults: DisplayResult[] | null = useMemo(() => {
    if (mode === "image") {
      return results?.slice(0, 8).map((result) => ({ location: result.location, similarity: result.similarity, matchedImageId: result.matchedImageId })) ?? null;
    }
    return textResults?.slice(0, 8).map((result) => ({ location: result.location, matchedOn: result.matchedOn })) ?? null;
  }, [mode, results, textResults]);
  // SearchResultsMap's prop type requires similarity/matchedImageId (image
  // search's own domain shape); it never reads either field internally
  // (only `location`), so a text result's absent similarity is a safe,
  // invisible placeholder here -- not a similarity badge anywhere on screen.
  const mapResults: LocationSearchResult[] = useMemo(
    () => (displayedResults ?? []).map((result) => ({ location: result.location, similarity: result.similarity ?? 0, matchedImageId: result.matchedImageId ?? "" })),
    [displayedResults],
  );
  const activeResult = displayedResults?.find(({ location }) => location.id === activeLocationId);

  return <div className="grid items-start gap-8 lg:grid-cols-[340px_minmax(0,1fr)] xl:gap-10">
    <aside id="reference-image" className="scene-panel search-reference p-4 sm:p-5" aria-labelledby="reference-image-title">
      <p className="scene-kicker">Search input</p>
      <h2 id="reference-image-title" className="mt-2 text-xl font-bold">{mode === "image" ? "참고 이미지" : "검색어 입력"}</h2>
      <p className="mt-1 text-sm text-muted">{mode === "image" ? "찾고 싶은 장면의 사진과 검색 조건을 준비하세요." : "찾고 싶은 장소를 문장으로 설명해 주세요."}</p>

      <div className="mt-4 inline-flex rounded-[var(--radius-control)] border border-line bg-white p-1 shadow-sm" role="group" aria-label="검색 방식 선택">
        {([{ value: "image", label: "사진으로 검색", Icon: ImagePlus }, { value: "text", label: "텍스트로 검색", Icon: MessageSquareText }] as const).map(({ value, label, Icon }) => (
          <button key={value} type="button" aria-pressed={mode === value} disabled={isBusy} onClick={() => switchMode(value)} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${mode === value ? "bg-brand text-white" : "text-muted hover:bg-brand-soft"}`}>
            <Icon size={16} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      {mode === "image" ? <>
        <input ref={fileInputRef} type="file" name="reference-image" accept="image/jpeg,image/png,image/webp" aria-label="참고 이미지 파일 선택" className="sr-only" disabled={!uploadReady || busy} onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
        {preview && file ? <div className="mt-4">
          <div className="overflow-hidden rounded-[var(--radius-media)] border border-line bg-stone-100"><Image src={preview} alt="선택한 참고 이미지" width={520} height={360} unoptimized className="h-48 w-full object-contain lg:h-56" /></div>
          <div className="mt-3 flex min-w-0 items-center gap-2 text-sm text-muted"><FileImage size={16} className="shrink-0" aria-hidden="true" /><span className="truncate" title={file.name}>{file.name}</span><span className="ml-auto shrink-0 text-xs">{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 1 })} MB`}</span></div>
          <div className="mt-3 flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => fileInputRef.current?.click()}><ImagePlus size={16} aria-hidden="true" />다른 사진 선택</Button><Button type="button" variant="outline" disabled={busy} aria-label="선택한 이미지 삭제" onClick={removeFile}><Trash2 size={16} aria-hidden="true" /></Button></div>
        </div> : <div onDragEnter={(event) => { event.preventDefault(); if (!busy) setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
          <button type="button" disabled={!uploadReady || busy} onClick={() => fileInputRef.current?.click()} className={`mt-4 flex min-h-52 w-full flex-col items-center justify-center rounded-[var(--radius-media)] border border-dashed p-5 text-center transition-colors ${isDragging ? "border-brand bg-brand-soft" : "border-stone-300 bg-stone-50 hover:border-brand hover:bg-brand-soft"}`}>
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand"><Upload size={24} aria-hidden="true" /></span><span className="mt-3 font-bold">참고 이미지 업로드</span><span className="mt-2 text-xs text-muted">선택하거나 끌어놓기 · JPEG, PNG, WebP · 최대 15MB</span>
          </button>
        </div>}
      </> : <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void searchText(); }}>
        <label className="text-sm font-medium" htmlFor="text-search-query">검색어</label>
        <div className="mt-2 flex gap-2">
          <input
            id="text-search-query"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            className="scene-input flex-1"
            placeholder="예: 해운대 카페, 광안리 야경"
            maxLength={TEXT_SEARCH_QUERY_MAX_LENGTH}
            value={query}
            disabled={!uploadReady || textBusy}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" disabled={!uploadReady || textBusy} aria-busy={textBusy}>
            {textBusy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
            검색
          </Button>
        </div>
      </form>}

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">검색 조건 <span className="font-normal text-muted">(선택)</span></h3><button type="button" disabled={isBusy || !hasActiveFilters} onClick={resetFilters} className="min-h-11 px-2 text-sm font-semibold text-brand disabled:text-stone-400">초기화</button></div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
          <label className="text-sm font-medium">지역<select name="district" className="scene-input mt-2" value={district} disabled={isBusy} onChange={(e) => { setDistrict(toValidDistrict(e.target.value)); setCatalogOffset(0); clearActiveResults(); setVisibleCount(12); }}><option value="">부산 전체</option>{districtOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="text-sm font-medium">공간 종류<select name="category" className="scene-input mt-2" value={category} disabled={isBusy} onChange={(e) => { setCategory(e.target.value as LocationCategory | ""); setCatalogOffset(0); clearActiveResults(); setVisibleCount(12); }}><option value="">전체</option>{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">{district ? DISTRICT_LABELS[district] : "부산 전체"} · {categoryOptions.find((option) => option.value === category)?.label ?? "전체 공간"}{catalogLoading || catalog.key !== filterKey ? " — 장소 목록 확인 중…" : catalogError ? " — 목록 연결을 확인해 주세요. 검색은 계속 사용할 수 있습니다." : catalog.hasMore ? ` — 장소 ${filteredExamples.length}곳을 불러왔습니다. 아래에서 더 볼 수 있어요.` : `에 등록된 장소 ${filteredExamples.length}곳.`}</p>
        {mode === "text" && <p className="mt-2 text-xs leading-relaxed text-stone-500">텍스트 검색에도 적용됩니다. 검색어 속 구·군/공간 표현과 다르면 이 필터를 우선합니다.</p>}
      </div>

      {mode === "image" && <Button onClick={search} disabled={busy} aria-busy={busy} size="lg" className="mt-5 w-full">{busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}{busy ? searchButtonText : results ? "다시 검색하기" : "이 이미지로 장소 찾기"}</Button>}
      {aiUiState && aiUiState.kind !== "error" && <div role="status" aria-live="polite" className="scene-status mt-4" data-tone="progress">
        <p className="text-sm font-semibold">{aiUiState.title}</p><p className="mt-2 text-sm leading-relaxed">{aiUiState.description}</p>
        {aiUiState.progress !== undefined && <><div className="mt-3 flex justify-between text-xs"><span>분석 도구 다운로드</span><span className="tabular-nums">{aiUiState.progress}%</span></div><progress aria-label="분석 도구 다운로드" value={aiUiState.progress} max={100} className="mt-1 h-2 w-full accent-emerald-800" /></>}
      </div>}
      {!isBusy && mode === "image" && searchStage === "complete" && <p role="status" className="scene-status mt-3 text-sm font-semibold" data-tone="success">검색 완료 · 촬영 후보 {displayedResults?.length ?? 0}곳을 찾았습니다.</p>}
      {!isBusy && mode === "text" && textResults !== null && !textError && <p role="status" className="scene-status mt-3 text-sm font-semibold" data-tone="success">검색 완료 · 촬영 후보 {displayedResults?.length ?? 0}곳을 찾았습니다.</p>}
      {mode === "text" && textNotice && <div role="status" className="scene-status mt-4" data-tone="progress"><p className="flex items-start gap-2 text-sm leading-relaxed"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{textNotice.message}</p></div>}
      {mode === "text" && textUnsupportedConditions.length > 0 && <div role="status" className="scene-status mt-3" data-tone="progress">
        <p className="flex items-start gap-2 text-sm leading-relaxed"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />다음 조건은 확인할 수 있는 정보가 없어 반영하지 못했습니다: {textUnsupportedConditions.join(", ")}</p>
      </div>}
      {activeError && <div role="alert" className="scene-status mt-4" data-tone="error"><p className="text-sm font-bold">{activeError.title}</p><p className="mt-2 text-sm leading-relaxed">{activeError.description}</p>{activeError.detail && <p className="mt-2 break-words text-xs">오류 정보: {activeError.detail}</p>}{activeError.retryable && <Button type="button" variant="outline" disabled={isBusy} onClick={mode === "image" ? search : searchText} className="mt-3">다시 시도</Button>}</div>}
      <p className="mt-4 text-xs leading-relaxed text-muted">{mode === "image" ? searchModeDescription : textSearchFooterDescription}</p>
    </aside>
    <section className="min-w-0" aria-busy={isBusy} aria-labelledby="search-results-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div><p className="scene-kicker">Results</p><h2 ref={resultHeadingRef} tabIndex={-1} id="search-results-title" className="mt-2 scroll-mt-24 text-2xl font-extrabold sm:text-3xl">{isBusy ? "촬영 장소를 찾고 있어요" : activeError ? "검색을 다시 시도해 주세요" : displayedResults ? `추천 장소 ${displayedResults.length}곳` : "촬영 장소 둘러보기"}</h2><p className="mt-2 text-sm text-muted">{displayedResults ? "참고 조건과 비교하고, 마음에 드는 장소를 저장하세요." : `등록된 ${filteredExamples.length}곳 · ${mode === "image" ? "사진을 선택하면" : "검색어를 입력하면"} 비슷한 장소를 찾아드려요.`}</p></div>
        {!!displayedResults?.length && <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-white p-1 shadow-sm" role="group" aria-label="검색 결과 보기 방식">{([{value:"photos", label:"사진", Icon:LayoutGrid}, {value:"map",label:"지도",Icon:MapPinned}] as const).map(({value,label,Icon}) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-bold ${view === value ? "bg-brand text-white" : "text-muted hover:bg-brand-soft"}`}><Icon size={16} aria-hidden="true" />{label}</button>)}</div>}
      </div>
      {mode === "image" && preview && displayedResults && <div className="sticky top-[var(--header-height)] z-30 mb-5 flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-white/95 p-3 shadow-[var(--shadow-panel)] backdrop-blur lg:hidden"><Image src={preview} alt="검색에 사용한 참고 이미지" width={64} height={48} unoptimized className="h-12 w-16 rounded-md object-contain bg-stone-100" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">참고 이미지와 비교하세요</p><a href="#reference-image" className="inline-flex min-h-11 items-center text-sm font-bold text-brand">사진·검색 조건 변경</a></div></div>}
      {mode === "text" && textParsedQuery && displayedResults && <p className="mb-4 text-xs leading-relaxed text-muted">인식된 조건: {textParsedQuery.district ? DISTRICT_LABELS[textParsedQuery.district] : "부산 전체"} · {categoryOptions.find((option) => option.value === textParsedQuery.category)?.label ?? "전체 공간"}{textParsedQuery.districtConflict && " · 구·군을 하나만 말씀해 주세요"}{textParsedQuery.keywords.length > 0 && ` · 키워드: ${textParsedQuery.keywords.join(", ")}`}</p>}
      {isBusy ? <SearchResultsSkeleton /> : activeError ? <div className="scene-empty"><h3 className="text-lg font-semibold">검색 결과를 표시할 수 없습니다</h3><p className="mt-2 text-sm text-muted">{mode === "image" ? "이미지와 연결 상태를 확인한 뒤 다시 시도해 주세요." : "검색어와 연결 상태를 확인한 뒤 다시 시도해 주세요."}</p></div> : displayedResults?.length === 0 ? <div className="scene-empty"><Search size={28} className="mx-auto text-muted" aria-hidden="true" /><h3 className="mt-4 text-lg font-semibold">조건에 맞는 장소가 없습니다</h3><p className="mt-2 text-sm text-muted">{mode === "image" ? "다른 사진을 선택하거나 지역·공간 조건을 넓혀보세요." : "다른 검색어를 시도하거나 지역·공간 조건을 넓혀보세요."}</p>{hasActiveFilters && <Button variant="outline" onClick={resetFilters} className="mt-5">검색 조건 초기화</Button>}</div> : displayedResults ? <div className="space-y-6">
        {view === "map" ? <><SearchResultsMap results={mapResults} activeLocationId={activeLocationId} onMarkerActivate={setActiveLocationId} />{activeResult && <div className="max-w-lg"><LocationCard location={activeResult.location} similarity={activeResult.similarity} matchedImageId={activeResult.matchedImageId} highlighted /><TextMatchBadges reasons={activeResult.matchedOn} /></div>}</> :
        <div className="scene-grid grid gap-5 sm:grid-cols-2 sm:gap-6">{displayedResults.map((result,index) => <div key={result.location.id}><LocationCard location={result.location} similarity={result.similarity} matchedImageId={result.matchedImageId} rank={index+1} eager={index < 2} highlighted={activeLocationId === result.location.id} onHighlightChange={(highlighted) => { if (highlighted) setActiveLocationId(result.location.id); }} /><TextMatchBadges reasons={result.matchedOn} /></div>)}</div>}
      </div> : <><div className="scene-grid grid gap-5 sm:grid-cols-2 sm:gap-6">{filteredExamples.slice(0,visibleCount).map((location,index) => <LocationCard key={location.id} location={location} eager={index < 2} />)}</div>{catalogLoading && <p role="status" className="mt-4 text-sm text-muted">장소 목록을 불러오는 중입니다.</p>}{catalogError && <p role="alert" className="mt-4 text-sm text-red-800">{catalogError}</p>}{!filteredExamples.length && !catalogLoading && !catalogError && catalog.key === filterKey && <div className="scene-empty"><p>이 조건에 등록된 장소가 없습니다.</p><Button variant="outline" onClick={resetFilters} className="mt-4">전체 장소 보기</Button></div>}{(filteredExamples.length > visibleCount || catalog.hasMore) && <div className="mt-8 text-center"><Button variant="outline" disabled={catalogLoading} onClick={() => { setVisibleCount((count) => count + 20); if (visibleCount >= filteredExamples.length) setCatalogOffset(filteredExamples.length); }}><ArrowDown size={16} aria-hidden="true" />장소 더 보기</Button><p className="mt-2 text-xs text-muted">{Math.min(visibleCount,filteredExamples.length)}곳 표시 중</p></div>}</>}
    </section>
  </div>;
}
