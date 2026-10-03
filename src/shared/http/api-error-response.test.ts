import { afterEach, describe, expect, it, vi } from "vitest";
import { validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "./api-error-response";

describe("apiErrorResponse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a structured safe response and emits one structured log", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiErrorResponse(validationError("요청 형식이 올바르지 않습니다."), "search.parse");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", message: "요청 형식이 올바르지 않습니다." },
      requestId: expect.any(String),
    });
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError.mock.calls[0][0]).toContain('"operation":"search.parse"');
  });

  it("never includes the underlying cause's message in the response body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiErrorResponse(new Error("column locations.secret_column does not exist"), "search.execute");
    const body = await response.text();
    expect(body).not.toContain("secret_column");
    expect(response.status).toBe(500);
  });
});
