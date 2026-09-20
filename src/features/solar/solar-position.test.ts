import { describe, expect, it } from "vitest";
import { getSolarPosition } from "./solar-position";

describe("getSolarPosition", () => {
  it("returns plausible daytime altitude and compass azimuth for Seoul", () => {
    const position = getSolarPosition({ latitude: 37.5665, longitude: 126.978 }, new Date("2026-06-21T03:00:00Z"));
    expect(position.altitudeDegrees).toBeGreaterThan(60);
    expect(position.azimuthDegrees).toBeGreaterThanOrEqual(0);
    expect(position.azimuthDegrees).toBeLessThan(360);
  });
});
