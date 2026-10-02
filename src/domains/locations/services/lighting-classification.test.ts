import { describe, expect, it } from "vitest";
import { classifyLighting } from "./lighting-classification";
import type { SolarPosition } from "@/types/domain";

const sunlight: SolarPosition = {
  azimuthDegrees: 90,
  altitudeDegrees: 35,
  isAboveHorizon: true,
};

describe("classifyLighting", () => {
  it("classifies back light when the camera points toward the sun", () => {
    expect(classifyLighting(sunlight, 90)).toBe("back-light");
    expect(classifyLighting(sunlight, 45)).toBe("back-light");
  });

  it("classifies front light when the sun is behind the camera", () => {
    expect(classifyLighting(sunlight, 270)).toBe("front-light");
    expect(classifyLighting(sunlight, 225)).toBe("front-light");
  });

  it("classifies side light for intermediate angles", () => {
    expect(classifyLighting(sunlight, 0)).toBe("side-light");
    expect(classifyLighting(sunlight, 180)).toBe("side-light");
  });

  it("normalizes headings around north", () => {
    expect(
      classifyLighting({ ...sunlight, azimuthDegrees: 350 }, -10),
    ).toBe("back-light");
  });

  it("returns null without usable direct sunlight", () => {
    expect(
      classifyLighting({ ...sunlight, isAboveHorizon: false }, 90),
    ).toBeNull();
    expect(classifyLighting(sunlight, Number.NaN)).toBeNull();
  });
});
