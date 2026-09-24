import { describe, expect, it } from "vitest";
import {
  getSolarPosition,
  radiansToDegrees,
  sunCalcAzimuthToCompassDegrees,
} from "./solar-position";

describe("sunCalcAzimuthToCompassDegrees", () => {
  it.each([
    ["north", -Math.PI, 0],
    ["east", -Math.PI / 2, 90],
    ["south", 0, 180],
    ["west", Math.PI / 2, 270],
    ["north after wrapping", Math.PI, 0],
  ])("converts SunCalc %s to compass degrees", (_direction, radians, expectedDegrees) => {
    expect(sunCalcAzimuthToCompassDegrees(radians)).toBeCloseTo(expectedDegrees, 10);
  });
});

describe("radiansToDegrees", () => {
  it("preserves the sign of altitude relative to the horizon", () => {
    expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90, 10);
    expect(radiansToDegrees(0)).toBe(0);
    expect(radiansToDegrees(-Math.PI / 6)).toBeCloseTo(-30, 10);
  });
});

describe("getSolarPosition", () => {
  it("returns plausible daytime altitude and compass azimuth for Seoul", () => {
    const position = getSolarPosition({ latitude: 37.5665, longitude: 126.978 }, new Date("2026-06-21T03:00:00Z"));
    expect(position.altitudeDegrees).toBeGreaterThan(60);
    expect(position.azimuthDegrees).toBeGreaterThanOrEqual(0);
    expect(position.azimuthDegrees).toBeLessThan(360);
    expect(position.isAboveHorizon).toBe(true);
  });

  it("reports the sun below the horizon at night", () => {
    const position = getSolarPosition({ latitude: 37.5665, longitude: 126.978 }, new Date("2026-06-21T15:00:00Z"));

    expect(position.altitudeDegrees).toBeLessThan(0);
    expect(position.isAboveHorizon).toBe(false);
  });

  it.each([
    [{ latitude: 91, longitude: 127 }, new Date("2026-06-21T03:00:00Z"), "Latitude"],
    [{ latitude: 37.5, longitude: Number.NaN }, new Date("2026-06-21T03:00:00Z"), "Longitude"],
    [{ latitude: 37.5, longitude: 127 }, new Date("invalid"), "Date"],
  ])("rejects invalid coordinates or dates", (point, date, expectedMessage) => {
    expect(() => getSolarPosition(point, date)).toThrow(expectedMessage);
  });
});
