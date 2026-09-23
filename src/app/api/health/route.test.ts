import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("health route", () => {
  it("reports readiness without caching", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "healthy", service: "scenescan" });
  });
});
