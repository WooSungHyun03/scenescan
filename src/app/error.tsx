"use client";

import { useEffect } from "react";
import { Button } from "@/shared/ui/button";
import { logger } from "@/shared/observability/logger";

export default function ApplicationErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled application render error", error, { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-20 text-center">
      <h1 className="text-3xl font-bold">화면을 불러오지 못했습니다.</h1>
      <p className="mt-4 text-stone-600">잠시 후 다시 시도해 주세요.</p>
      <Button className="mt-7" onClick={reset}>다시 시도</Button>
    </main>
  );
}
