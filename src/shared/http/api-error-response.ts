import { NextResponse } from "next/server";
import { toApplicationError } from "@/shared/errors/application-error";
import { logger } from "@/shared/observability/logger";

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
      error: applicationError.publicMessage,
      code: applicationError.code,
      requestId,
    },
    { status: applicationError.status },
  );
}
