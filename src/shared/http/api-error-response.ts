import { NextResponse } from "next/server";
import { toApplicationError } from "@/shared/errors/application-error";
import { logger } from "@/shared/observability/logger";
import { applyPrivateResponseCacheHeaders } from "./private-cache";

/**
 * `{ error: { code, message }, requestId }`. `code` is one of
 * ApplicationErrorCode (including UNAUTHENTICATED/FORBIDDEN/RATE_LIMITED);
 * `message` is always the Korean
 * user-facing publicMessage, never the raw internal error/cause. `requestId`
 * correlates the response with the structured server-side log entry.
 */
export function apiErrorResponse(error: unknown, operation: string): NextResponse {
  const applicationError = toApplicationError(error);
  const requestId = crypto.randomUUID();
  logger.error("API request failed", applicationError, {
    operation,
    requestId,
    code: applicationError.code,
    status: applicationError.status,
  });
  const response = NextResponse.json(
    {
      error: {
        code: applicationError.code,
        message: applicationError.publicMessage,
      },
      requestId,
    },
    { status: applicationError.status },
  );
  response.headers.set("Cache-Control", "no-store");
  if (applicationError.status === 401 || applicationError.status === 403) {
    applyPrivateResponseCacheHeaders(response.headers);
  }
  if (applicationError.retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(applicationError.retryAfterSeconds));
  }
  return response;
}
