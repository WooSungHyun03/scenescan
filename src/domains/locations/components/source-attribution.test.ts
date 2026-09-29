import { describe, expect, it } from "vitest";
import { getSafeSourceUrl } from "./source-attribution";

describe("getSafeSourceUrl", () => {
  it("accepts trimmed HTTP and HTTPS source links", () => {
    expect(getSafeSourceUrl(" https://data.example/location?id=1 ")).toBe(
      "https://data.example/location?id=1",
    );
    expect(getSafeSourceUrl("http://data.example/source")).toBe(
      "http://data.example/source",
    );
  });

  it("rejects unsafe, relative, and empty source links", () => {
    expect(getSafeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(getSafeSourceUrl("data:text/plain,source")).toBeNull();
    expect(getSafeSourceUrl("/relative/source")).toBeNull();
    expect(getSafeSourceUrl("   ")).toBeNull();
    expect(getSafeSourceUrl(null)).toBeNull();
  });
});
