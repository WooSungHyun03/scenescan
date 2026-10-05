import { describe, expect, it } from "vitest";

import { buildAuthCallbackUrl, getSafeAuthRedirect } from "./auth-redirect";

describe("auth redirect allow-list", () => {
  it.each([
    ["/", "/"],
    ["/search?region=%EC%84%9C%EC%9A%B8", "/search?region=%EC%84%9C%EC%9A%B8"],
    ["/shortlist#compare", "/shortlist#compare"],
    ["/account?confirmed=1", "/account?confirmed=1"],
    ["/locations/00000000-0000-4000-8000-000000000001", "/locations/00000000-0000-4000-8000-000000000001"],
  ])("accepts allow-listed internal destination %s", (value, expected) => {
    expect(getSafeAuthRedirect(value)).toBe(expected);
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal",
    "javascript:alert(1)",
    "/auth/callback?next=/account",
    "/locations/not-a-uuid",
    "/api/search",
  ])("rejects untrusted destination %s", (value) => {
    expect(getSafeAuthRedirect(value, "/search")).toBe("/search");
  });

  it("builds a same-origin callback containing only a sanitized next path", () => {
    expect(buildAuthCallbackUrl("https://scenescan.example", "//evil.example"))
      .toBe("https://scenescan.example/auth/callback?next=%2Faccount");
  });
});
