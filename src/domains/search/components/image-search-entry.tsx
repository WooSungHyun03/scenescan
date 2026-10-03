"use client";
import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, ArrowRight } from "lucide-react";
import { validateImageBlob } from "@/lib/ai/image-validation";
import { setSearchImageDraft } from "./search-image-draft";

export function ImageSearchEntry() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function select(file?: File) {
    if (!file) return;
    try { validateImageBlob(file); } catch {
      setError(file.size === 0 ? "빈 파일은 사용할 수 없습니다. 다른 사진을 선택해 주세요." : "15MB 이하의 JPEG, PNG, WebP 사진을 선택해 주세요.");
      return;
    }
    setSearchImageDraft(file);
    router.push("/search");
  }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); select(event.dataTransfer.files[0]); }
  return <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`mt-7 max-w-lg border border-dashed p-5 sm:p-6 ${dragging ? "border-brand bg-brand-soft" : "border-stone-300 bg-white"} rounded-lg`}>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="참고 이미지 파일 선택" className="sr-only" onChange={(e) => { select(e.target.files?.[0]); e.currentTarget.value = ""; }} />
    <button type="button" className="flex min-h-13 w-full items-center justify-between gap-3 rounded-md bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-hover" onClick={() => input.current?.click()}><span className="flex items-center gap-3"><ImagePlus size={21} aria-hidden="true" />참고 이미지 선택</span><ArrowRight size={18} aria-hidden="true" /></button>
    <p className="mt-3 text-center text-sm text-muted">사진을 여기에 끌어놓아도 됩니다.</p>
    <p className="mt-1 text-center text-xs text-muted">JPEG, PNG, WebP · 최대 15MB</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </div>;
}
