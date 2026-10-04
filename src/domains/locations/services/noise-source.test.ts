import { describe, expect, it } from "vitest";
import { getNoiseSourceKindLabel, isNoiseSourceVerificationStale } from "./noise-source";

describe("expected noise-source metadata", () => {
  it("flags missing, malformed, and older-than-one-year verification dates", () => {
    const now = new Date("2026-10-04T00:00:00Z");
    expect(isNoiseSourceVerificationStale(null, now)).toBe(true);
    expect(isNoiseSourceVerificationStale("invalid", now)).toBe(true);
    expect(isNoiseSourceVerificationStale("2025-09-01T00:00:00Z", now)).toBe(true);
    expect(isNoiseSourceVerificationStale("2026-07-15T00:00:00Z", now)).toBe(false);
  });

  it("uses explicit user-facing labels", () => {
    expect(getNoiseSourceKindLabel("major_road")).toBe("간선도로");
    expect(getNoiseSourceKindLabel("other")).toBe("기존 정보");
  });
});
