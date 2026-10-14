import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getAttributionViewModel, getSafeSourceUrl, SourceAttribution } from "./source-attribution";

describe("getSafeSourceUrl", () => {
  it("renders honest invalid-link feedback without disclosing rejected URLs", () => {
    const unsafe = "https://user:fake-render-canary@example.com/source";
    const html = renderToStaticMarkup(createElement(SourceAttribution, {
      source: unsafe, sourceUrl: unsafe, licenseUrl: unsafe, showDetails: true,
    }));
    expect(html).not.toContain("fake-render-canary");
    expect(html).not.toContain("href=");
    expect(html).toContain("형식");
  });
  it("does not expose credential-bearing source URLs as links or fallback text", () => {
    const unsafe = "https://user:fake-source-canary@data.example/private";
    expect(getSafeSourceUrl(unsafe)).toBeNull();
    expect(getAttributionViewModel({ source: unsafe, sourceUrl: unsafe, licenseUrl: unsafe })).toMatchObject({ source: null, sourceUrl: null, licenseUrl: null });
  });
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
