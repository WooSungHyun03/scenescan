import { describe, expect, it } from "vitest";
import { getAttributionViewModel, getSafeSourceUrl } from "./source-attribution";

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

  it("keeps text metadata while removing unsafe source and license links", () => {
    expect(getAttributionViewModel({
      source: "Wikimedia Commons",
      sourceUrl: "javascript:alert(1)",
      author: "  Example Author  ",
      license: "CC BY 4.0",
      licenseUrl: "data:text/html,unsafe",
      lastVerifiedAt: "not-a-date",
    })).toEqual({
      source: "Wikimedia Commons",
      sourceUrl: null,
      sourceUrlInvalid: true,
      author: "Example Author",
      license: "CC BY 4.0",
      licenseUrl: null,
      licenseUrlInvalid: true,
      lastVerifiedAt: null,
    });
  });

  it("formats a valid verification timestamp for the Korean detail UI", () => {
    expect(getAttributionViewModel({
      sourceUrl: "https://www.wikidata.org/wiki/Q1",
      lastVerifiedAt: "2026-09-29T13:00:00+09:00",
    })).toMatchObject({
      sourceUrl: "https://www.wikidata.org/wiki/Q1",
      lastVerifiedAt: "2026년 9월 29일",
    });
  });
});
