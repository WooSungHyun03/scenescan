export type ApplicationErrorCode =
  | "BAD_REQUEST"
  | "CONFIGURATION_ERROR"
  | "DATA_ACCESS_ERROR"
  | "INTERNAL_ERROR";

type ApplicationErrorOptions = {
  code: ApplicationErrorCode;
  status: number;
  publicMessage: string;
  cause?: unknown;
};

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly status: number;
  readonly publicMessage: string;

  constructor(message: string, options: ApplicationErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ApplicationError";
    this.code = options.code;
    this.status = options.status;
    this.publicMessage = options.publicMessage;
  }
}

export function badRequest(message: string): ApplicationError {
  return new ApplicationError(message, {
    code: "BAD_REQUEST",
    status: 400,
    publicMessage: message,
  });
}

export function configurationError(message: string): ApplicationError {
  return new ApplicationError(message, {
    code: "CONFIGURATION_ERROR",
    status: 503,
    publicMessage: "Service configuration unavailable",
  });
}

export function dataAccessError(message: string, cause: unknown): ApplicationError {
  return new ApplicationError(message, {
    code: "DATA_ACCESS_ERROR",
    status: 503,
    publicMessage: "Search unavailable",
    cause,
  });
}

export function toApplicationError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError("Unexpected application error", {
    code: "INTERNAL_ERROR",
    status: 500,
    publicMessage: "Internal server error",
    cause: error,
  });
}
