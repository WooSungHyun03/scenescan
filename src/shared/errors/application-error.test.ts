import { describe, expect, it } from "vitest";
import {
  ApplicationError,
  badRequest,
  configurationError,
  dataAccessError,
  toApplicationError,
} from "./application-error";

describe("application errors", () => {
  it("preserves intentional public errors", () => {
    const error = badRequest("Invalid JSON");
    expect(toApplicationError(error)).toBe(error);
    expect(error).toMatchObject({ code: "BAD_REQUEST", status: 400, publicMessage: "Invalid JSON" });
  });

  it("maps configuration and data failures to safe public messages", () => {
    expect(configurationError("missing key").publicMessage).toBe("Service configuration unavailable");
    expect(dataAccessError("query failed", new Error("database detail")).publicMessage).toBe("Search unavailable");
  });

  it("wraps unknown failures without exposing their details", () => {
    const error = toApplicationError(new Error("secret detail"));
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500, publicMessage: "Internal server error" });
  });
});
