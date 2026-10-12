"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import type { TextSearchResponse } from "@/types/text-search";
import { ImageSearchEntry } from "./image-search-entry";
import { getSearchSession, setSearchSession, type SearchMode } from "./search-image-draft";

const examples = ["해운대 바다", "감천문화마을 골목", "부산 카페"];

export function HomeSearchEntry() {
  const router = useRouter();
  const [mode, setMode] = useState<SearchMode>("image");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (request.current) return;
    const trimmed = query.trim();
    if (!trimmed) { setError("찾고 싶은 장소를 입력해 주세요."); return; }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/search/text", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      if (!response.ok) throw new Error("장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      const data: TextSearchResponse = await response.json();
      if (!Array.isArray(data.results) || !data.parsedQuery || !Array.isArray(data.unsupportedConditions)) {
        throw new Error("검색 결과를 확인하지 못했습니다. 다시 시도해 주세요.");
      }
      if (controller.signal.aborted) return;
      const previous = getSearchSession();
      setSearchSession({
        mode: "text", file: previous?.file ?? null,
        // This unfiltered home query resets the shared filters. A previous
        // filtered image result cannot survive under the new filter labels.
        results: previous?.district || previous?.category ? null : previous?.results ?? null,
        district: "", category: "",
        text: { query: trimmed, results: data.results, parsedQuery: data.parsedQuery,
          unsupportedConditions: data.unsupportedConditions, notice: data.notice ?? null },
      });
      router.push("/search");
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "연결을 확인하고 다시 검색해 주세요.");
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }

  return (
    <div className="mt-7 max-w-xl">
      <div role="group" aria-label="장소 검색 방식" className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-stone-50 p-1">
        {([['image', '사진으로 검색'], ['text', '텍스트로 검색']] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={mode === value} disabled={busy}
            onClick={() => { setMode(value); setError(null); }}
            className={`min-h-11 rounded-md px-3 text-sm font-bold ${mode === value ? "bg-brand text-white" : "text-muted hover:bg-brand-soft"}`}>{label}</button>
        ))}
      </div>
      {mode === "image" ? <ImageSearchEntry /> : (
        <form onSubmit={search} className="mt-4 rounded-[var(--radius-panel)] border border-line bg-white p-4 shadow-[var(--shadow-panel)]" aria-busy={busy}>
          <label htmlFor="home-text-query" className="text-sm font-bold">어떤 촬영 장소를 찾으세요?</label>
          <input id="home-text-query" value={query} onChange={(event) => setQuery(event.target.value)}
            maxLength={200} disabled={busy} className="scene-input mt-2" placeholder="예: 해운대 바다가 보이는 장소"
            aria-describedby="home-text-help" />
          <div className="mt-3 flex flex-wrap gap-2" aria-label="예시 검색어">
            {examples.map((example) => <button key={example} type="button" disabled={busy} onClick={() => setQuery(example)}
              className="min-h-11 rounded-lg bg-stone-100 px-3 text-xs font-semibold text-stone-700 hover:bg-brand-soft">{example}</button>)}
          </div>
          <button type="submit" disabled={busy || !query.trim()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 font-bold text-white hover:bg-brand-hover disabled:opacity-60">
            {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
            {busy ? "장소를 찾는 중…" : "장소 검색"}
          </button>
          <p id="home-text-help" className="mt-3 text-xs leading-relaxed text-muted">부산의 장소 이름, 지역, 공간 특징을 문장으로 입력하세요.</p>
          {error && <p role="alert" className="scene-status mt-3" data-tone="error">{error}</p>}
        </form>
      )}
    </div>
  );
}
