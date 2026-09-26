export const PERMIT_GUIDANCE_VALUES = [
  "문의 필요",
  "정보 확인 필요",
  "영상위원회 문의",
  "기관 직접 문의",
] as const;

export type PermitGuidance = (typeof PERMIT_GUIDANCE_VALUES)[number];

export function isPermitGuidance(value: unknown): value is PermitGuidance {
  return typeof value === "string" && PERMIT_GUIDANCE_VALUES.includes(value as PermitGuidance);
}

function normalizePermitKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function sourcePermitText(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") {
    throw new Error("Permit guidance must not use an allowed/not-allowed boolean");
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") {
    throw new Error("Permit guidance must come from a source string or finite number");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizedPermitMap(
  sourceMapping: Readonly<Record<string, PermitGuidance>>,
): Map<string, PermitGuidance> {
  const normalized = new Map<string, PermitGuidance>();
  for (const [sourceValue, guidance] of Object.entries(sourceMapping)) {
    const key = normalizePermitKey(sourceValue);
    if (key.length === 0) throw new Error("Permit mapping keys must not be blank");
    const existing = normalized.get(key);
    if (existing && existing !== guidance) {
      throw new Error(`Conflicting permit mappings for normalized source value "${key}"`);
    }
    normalized.set(key, guidance);
  }
  return normalized;
}

/**
 * Converts a provider value to non-decisive SceneScan permit guidance.
 * Missing values use the configured safe fallback. Unknown values must be
 * explicitly mapped after reviewing the provider source; no inference occurs.
 */
export function mapPermitGuidance(
  value: unknown,
  sourceMapping: Readonly<Record<string, PermitGuidance>>,
  fallback: PermitGuidance,
): PermitGuidance {
  const sourceValue = sourcePermitText(value);
  if (sourceValue === null) return fallback;

  const key = normalizePermitKey(sourceValue);
  const mapped = normalizedPermitMap(sourceMapping).get(key);
  if (mapped) return mapped;
  if (isPermitGuidance(sourceValue)) return sourceValue;

  throw new Error(
    `Permit guidance value "${sourceValue}" is not approved; add an explicit permitTypeMap entry after source review`,
  );
}
