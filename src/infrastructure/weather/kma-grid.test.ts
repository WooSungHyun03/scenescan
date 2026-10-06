import { describe, expect, it } from "vitest";

import { isKmaGridPoint, toKmaGrid } from "./kma-grid";

describe("KMA grid conversion", () => {
  it.each([
    ["Seoul", 37.5665, 126.978, { x: 60, y: 127 }],
    ["Busan", 35.1796, 129.0756, { x: 98, y: 76 }],
    ["Jeju", 33.4996, 126.5312, { x: 53, y: 38 }],
  ])("converts %s WGS84 coordinates to the official 5 km grid", (_name, latitude, longitude, expected) => {
    expect(toKmaGrid({ latitude, longitude })).toEqual(expected);
  });

  it("rejects invalid coordinates and points outside the published grid", () => {
    expect(toKmaGrid({ latitude: Number.NaN, longitude: 127 })).toBeNull();
    expect(toKmaGrid({ latitude: 0, longitude: 0 })).toBeNull();
    expect(isKmaGridPoint({ x: 0, y: 127 })).toBe(false);
    expect(isKmaGridPoint({ x: 60.5, y: 127 })).toBe(false);
  });
});
