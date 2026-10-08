import type { District } from "@/types/domain";
import { DISTRICT_LABELS } from "@/types/location-options";

// Keep source data intact. Never invent a translation or unverified filming facts.
export function getKoreanDescription(description: string, fallback: string): string {
  const value = description.trim();
  return /[가-힣]/u.test(value) ? value : fallback;
}

// Single place every screen reads a location's area label from, so the
// "부산" + 구/군 combination never drifts out of sync. `district` null means
// unconfirmed (see docs/database.md) -- never guessed, so this falls back to
// the region alone rather than inventing a 구/군.
export function getLocationAreaLabel(district: District | null): string {
  return district ? `부산 ${DISTRICT_LABELS[district]}` : "부산";
}
