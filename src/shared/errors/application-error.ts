export type ApplicationErrorCode =
  | "VALIDATION_ERROR"
  | "LOCATION_NOT_FOUND"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "DATA_UNAVAILABLE"
  | "SEARCH_FAILED";

type ApplicationErrorOptions = {
  code: ApplicationErrorCode;
  status: number;
  publicMessage: string;
  cause?: unknown;
  retryAfterSeconds?: number;
};

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly status: number;
  readonly publicMessage: string;
  readonly retryAfterSeconds?: number;

  constructor(message: string, options: ApplicationErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ApplicationError";
    this.code = options.code;
    this.status = options.status;
    this.publicMessage = options.publicMessage;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function unauthenticatedError(message: string): ApplicationError {
  return new ApplicationError(message, {
    code: "UNAUTHENTICATED",
    status: 401,
    publicMessage: "로그인이 필요합니다.",
  });
}

export function forbiddenError(message: string): ApplicationError {
  return new ApplicationError(message, {
    code: "FORBIDDEN",
    status: 403,
    publicMessage: "이 작업을 수행할 권한이 없습니다.",
  });
}

export function rateLimitedError(
  message: string,
  retryAfterSeconds = 60,
): ApplicationError {
  return new ApplicationError(message, {
    code: "RATE_LIMITED",
    status: 429,
    publicMessage: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
  });
}

/** The request itself is malformed (bad JSON, failed Zod validation, oversized body). `message` is shown to the user, so callers must keep it free of internal detail. */
export function validationError(message: string): ApplicationError {
  return new ApplicationError(message, {
    code: "VALIDATION_ERROR",
    status: 400,
    publicMessage: message,
  });
}

/** A requested location does not exist. Not reachable via any HTTP route today (getLocation is called directly from a Server Component, which uses Next's notFound() instead) -- added for the shared error taxonomy ahead of a future location API route. */
export function notFoundError(message: string): ApplicationError {
  return new ApplicationError(message, {
    code: "LOCATION_NOT_FOUND",
    status: 404,
    publicMessage: "요청한 장소를 찾을 수 없습니다.",
  });
}

/** The server could not reach the data it needed -- missing configuration (env vars) or a live Supabase/DB failure. Both collapse to the same public code/status: the client has no use for the internal distinction, and neither message may repeat the underlying cause. */
export function configurationError(message: string): ApplicationError {
  return new ApplicationError(message, {
    code: "DATA_UNAVAILABLE",
    status: 503,
    publicMessage: "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
  });
}

export function dataAccessError(message: string, cause: unknown): ApplicationError {
  return new ApplicationError(message, {
    code: "DATA_UNAVAILABLE",
    status: 503,
    publicMessage: "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
    cause,
  });
}

/** Catch-all for anything unexpected. Named for its one current caller (POST /api/search); revisit as a route-aware mapping if a second JSON API route starts throwing through this same path with a different public meaning. */
export function toApplicationError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError("Unexpected application error", {
    code: "SEARCH_FAILED",
    status: 500,
    publicMessage: "검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    cause: error,
  });
}
