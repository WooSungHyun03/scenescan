import { afterEach, describe, expect, it, vi } from "vitest";
import { badRequest } from "@/shared/errors/application-error";
import { apiErrorResponse } from "./api-error-response";

describe("apiErrorResponse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a structured safe response and emits one structured log", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiErrorResponse(badRequest("Invalid JSON"), "search.parse");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid JSON",
      code: "BAD_REQUEST",
      requestId: expect.any(String),
    });
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError.mock.calls[0][0]).toContain('"operation":"search.parse"');
  });
});
