"use client";
import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, ArrowRight, ShieldCheck } from "lucide-react";
import { validateImageBlob } from "@/lib/ai/image-validation";
import { setSearchImageDraft } from "./search-image-draft";
import { useUploadReady } from "./use-upload-ready";

export function ImageSearchEntry() {
  const uploadReady = useUploadReady();
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
  return (
    <div
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`mt-7 max-w-xl rounded-[var(--radius-panel)] border p-3 shadow-[var(--shadow-panel)] transition-colors sm:p-4 ${
        dragging ? "border-brand bg-brand-soft" : "border-line bg-white"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="참고 이미지 파일 선택"
        aria-describedby="home-upload-help"
        className="sr-only"
        disabled={!uploadReady}
        onChange={(event) => { select(event.target.files?.[0]); event.currentTarget.value = ""; }}
      />
      <button
        type="button"
        disabled={!uploadReady}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] bg-brand px-5 py-3.5 font-bold text-white transition-colors hover:bg-brand-hover"
        onClick={() => input.current?.click()}
      >
        <span className="flex items-center gap-3"><ImagePlus size={21} aria-hidden="true" />참고 이미지 선택</span>
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      <div id="home-upload-help" className="mt-3 flex flex-col justify-between gap-2 px-1 text-xs text-muted sm:flex-row sm:items-center">
        <span>또는 사진을 이 영역에 끌어놓으세요 · JPEG, PNG, WebP · 최대 15MB</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-stone-600"><ShieldCheck size={14} aria-hidden="true" />서버에 저장하지 않음</span>
      </div>
      {error && <p role="alert" className="scene-status mt-3 text-sm" data-tone="error">{error}</p>}
    </div>
  );
}
