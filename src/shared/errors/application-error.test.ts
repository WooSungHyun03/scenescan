import { describe, expect, it } from "vitest";
import {
  ApplicationError,
  configurationError,
  dataAccessError,
  forbiddenError,
  notFoundError,
  rateLimitedError,
  toApplicationError,
  unauthenticatedError,
  validationError,
} from "./application-error";

describe("application errors", () => {
  it("preserves intentional public errors", () => {
    const error = validationError("embedding 값이 올바르지 않습니다.");
    expect(toApplicationError(error)).toBe(error);
    expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400, publicMessage: "embedding 값이 올바르지 않습니다." });
  });

  it("maps a missing location to a 404 with a Korean public message", () => {
    const error = notFoundError("location xyz not found");
    expect(error).toMatchObject({ code: "LOCATION_NOT_FOUND", status: 404, publicMessage: "요청한 장소를 찾을 수 없습니다." });
  });

  it("maps configuration and data failures to the same safe public code/message", () => {
    expect(configurationError("missing key")).toMatchObject({ code: "DATA_UNAVAILABLE", status: 503 });
    expect(dataAccessError("query failed", new Error("database detail"))).toMatchObject({ code: "DATA_UNAVAILABLE", status: 503 });
    expect(configurationError("missing key").publicMessage).toBe(dataAccessError("x", null).publicMessage);
  });

  it("defines the shared authentication, authorization, and rate-limit contract", () => {
    expect(unauthenticatedError("missing verified claims")).toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
      publicMessage: "로그인이 필요합니다.",
    });
    expect(forbiddenError("not owner")).toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      publicMessage: "이 작업을 수행할 권한이 없습니다.",
    });
    expect(rateLimitedError("too many requests", 1.2)).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 2,
    });
    expect(rateLimitedError("invalid retry delay", 0).retryAfterSeconds).toBe(1);
  });

  it("never leaks the underlying cause's message into the public message", () => {
    const error = dataAccessError("query failed", new Error("column locations.secret does not exist"));
    expect(error.publicMessage).not.toContain("secret");
    expect(error.publicMessage).not.toContain("column");
  });

  it("wraps unknown failures without exposing their details", () => {
    const error = toApplicationError(new Error("secret detail"));
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({ code: "SEARCH_FAILED", status: 500 });
    expect(error.publicMessage).not.toContain("secret detail");
  });
});
