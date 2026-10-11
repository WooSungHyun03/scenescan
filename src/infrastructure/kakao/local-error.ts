export type KakaoLocalErrorCode =
  | "CONFIGURATION"
  | "VALIDATION"
  | "FORBIDDEN"
  | "QUOTA"
  | "TIMEOUT"
  | "CANCELLED"
  | "MALFORMED_RESPONSE"
  | "UPSTREAM";

export class KakaoLocalError extends Error {
  readonly code: KakaoLocalErrorCode;

  constructor(code: KakaoLocalErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KakaoLocalError";
    this.code = code;
  }
}
