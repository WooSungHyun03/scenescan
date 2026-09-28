import { describe, expect, it } from "vitest";
import {
  ApplicationError,
  configurationError,
  dataAccessError,
  notFoundError,
  toApplicationError,
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
