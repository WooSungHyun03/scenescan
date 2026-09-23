"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { LocationCard } from "@/domains/locations/components/location-card";
import { createImageEmbeddingService } from "@/lib/ai";
import { Button } from "@/shared/ui/button";
import type { Location, LocationCategory, LocationSearchResult, Region } from "@/types/domain";
import type { SearchResponse } from "@/types/contracts";

const searchModeDescription = process.env.NEXT_PUBLIC_USE_MOCK_AI === "false"
  ? "브라우저에서 실제 CLIP 임베딩을 생성합니다. 장소 데이터는 배포 환경 설정에 따라 검색됩니다."
  : "기본 설정에서는 가상 데이터와 mock 임베딩으로 검색 흐름을 체험합니다.";

export function SearchWorkspace({ examples }: { examples: Location[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | "">("");
  const [category, setCategory] = useState<LocationCategory | "">("");
  const [results, setResults] = useState<LocationSearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const embeddingService = useMemo(() => createImageEmbeddingService(), []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function search() {
    if (!file) { setError("이미지를 선택하세요."); return; }
    setBusy(true); setError(null);
    try {
      const embedding = await embeddingService.embed(file);
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embedding, filters: { region: region || undefined, category: category || undefined } }) });
      if (!response.ok) throw new Error("검색 요청에 실패했습니다.");
      const data = await response.json() as SearchResponse;
      setResults(data.results);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "검색 중 오류가 발생했습니다."); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-8 lg:grid-cols-[290px_1fr]">
    <aside className="scene-panel h-fit p-5"><h2 className="text-lg font-semibold">레퍼런스 이미지</h2>
      <label className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-center text-sm text-stone-600">
        {preview ? <Image src={preview} alt="선택한 레퍼런스 이미지" width={260} height={180} unoptimized className="max-h-44 w-auto rounded object-contain" /> : "클릭해서 이미지 선택"}
        <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); setPreview(next ? URL.createObjectURL(next) : null); setResults(null); }} />
      </label>
      <div className="mt-6 space-y-4"><label className="block text-sm font-semibold">지역<select value={region} onChange={(event) => setRegion(event.target.value as Region | "")} className="mt-2 w-full rounded-md border border-stone-300 bg-white p-2.5 font-normal"><option value="">전체</option>{["서울", "부산", "인천", "경기"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="block text-sm font-semibold">카테고리<select value={category} onChange={(event) => setCategory(event.target.value as LocationCategory | "")} className="mt-2 w-full rounded-md border border-stone-300 bg-white p-2.5 font-normal"><option value="">전체</option><option value="urban">도시</option><option value="nature">자연</option><option value="industrial">산업</option><option value="interior">실내</option></select></label></div>
      <Button onClick={search} disabled={busy} className="mt-6 w-full"><Search size={16} />{busy ? "검색 중…" : "비슷한 장소 찾기"}</Button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <p className="mt-4 text-xs leading-relaxed text-stone-500">{searchModeDescription}</p>
    </aside>
    <section><div className="mb-5 flex items-end justify-between"><div><p className="scene-label">MATCHES</p><h2 className="mt-1 text-2xl font-bold">{results ? "Top 8 Locations" : "예시 장소"}</h2></div><span className="text-sm text-stone-500">{results?.length ?? examples.length}곳</span></div>
      {results?.length === 0 ? <p className="scene-panel p-8 text-stone-600">조건에 맞는 장소가 없습니다.</p> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{results ? results.map(({ location, similarity }) => <LocationCard key={location.id} location={location} similarity={similarity} />) : examples.map((location) => <LocationCard key={location.id} location={location} />)}</div>}
    </section>
  </div>;
}
