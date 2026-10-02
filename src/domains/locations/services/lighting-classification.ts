import type {
  LightingClassification,
  SolarPosition,
} from "@/types/domain";

function smallestAngleDifference(first: number, second: number) {
  return Math.abs(((first - second + 540) % 360) - 180);
}

export function classifyLighting(
  position: SolarPosition,
  cameraHeadingDegrees: number,
): LightingClassification | null {
  if (
    !position.isAboveHorizon ||
    !Number.isFinite(position.azimuthDegrees) ||
    !Number.isFinite(cameraHeadingDegrees)
  ) {
    return null;
  }

  const difference = smallestAngleDifference(
    position.azimuthDegrees,
    cameraHeadingDegrees,
  );

  if (difference <= 45) return "back-light";
  if (difference >= 135) return "front-light";
  return "side-light";
}
