export const SHORTLIST_STORAGE_KEY = "scenescan.shortlist.location-ids.v1";

export function normalizeShortlistIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function parseShortlistIds(value: string | null): string[] {
  if (!value) return [];

  try {
    return normalizeShortlistIds(JSON.parse(value));
  } catch {
    return [];
  }
}
