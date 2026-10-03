"use client";

import { useEffect } from "react";
import { Button } from "@/shared/ui/button";
import { logger } from "@/shared/observability/logger";
import { isChunkLoadError } from "@/shared/errors/chunk-load-error";

export default function ApplicationErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stalePage = isChunkLoadError(error);
  useEffect(() => {
    logger.error("Unhandled application render error", error, { digest: error.digest });
  }, [error]);

  return (
    <main className="scene-container py-20 text-center">
      <h1 className="text-3xl font-bold">{stalePage ? "최신 화면을 다시 불러와 주세요" : "화면을 불러오지 못했습니다"}</h1>
      <p className="mx-auto mt-4 max-w-lg text-muted">{stalePage ? "서비스가 업데이트되었거나 화면 파일을 불러오지 못했습니다. 새로고침하면 현재 페이지를 다시 열 수 있습니다. 저장한 관심 장소는 유지됩니다." : "연결 상태를 확인한 뒤 다시 시도해 주세요."}</p>
      <Button className="mt-7" onClick={stalePage ? () => window.location.reload() : reset}>{stalePage ? "화면 새로고침" : "다시 시도"}</Button>
    </main>
  );
}
