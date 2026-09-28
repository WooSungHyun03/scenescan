import { NextResponse } from "next/server";
import { toApplicationError } from "@/shared/errors/application-error";
import { logger } from "@/shared/observability/logger";

/**
 * `{ error: { code, message }, requestId }`. `code` is one of
 * ApplicationErrorCode (VALIDATION_ERROR/LOCATION_NOT_FOUND/
 * DATA_UNAVAILABLE/SEARCH_FAILED); `message` is always the Korean
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
  return NextResponse.json(
    {
      error: {
        code: applicationError.code,
        message: applicationError.publicMessage,
      },
      requestId,
    },
    { status: applicationError.status },
  );
}
