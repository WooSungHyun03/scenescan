"use client";

import { useEffect } from "react";
import { logger } from "@/shared/observability/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled root render error", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main style={{ margin: "5rem auto", maxWidth: "42rem", padding: "0 1.25rem", textAlign: "center" }}>
          <h1>SceneScan을 불러오지 못했습니다.</h1>
          <p>잠시 후 다시 시도해 주세요.</p>
          <button type="button" onClick={reset}>다시 시도</button>
        </main>
      </body>
    </html>
  );
}
