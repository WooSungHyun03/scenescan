import type { NoiseSourceKind } from "@/types/domain";

export const NOISE_SOURCE_MAX_AGE_DAYS = 365;

export function isNoiseSourceVerificationStale(
  lastVerifiedAt: string | null,
  now = new Date(),
  maximumAgeDays = NOISE_SOURCE_MAX_AGE_DAYS,
): boolean {
  if (!lastVerifiedAt) return true;
  const verified = new Date(lastVerifiedAt);
  if (!Number.isFinite(verified.getTime()) || !Number.isFinite(now.getTime())) return true;
  return now.getTime() - verified.getTime() > maximumAgeDays * 24 * 60 * 60 * 1_000;
}

export function getNoiseSourceKindLabel(kind: NoiseSourceKind): string {
  return {
    railway: "철도",
    major_road: "간선도로",
    airport: "공항",
    construction: "공사 가능 시설",
    other: "기존 정보",
  }[kind];
}
