import type { Location, LocationSearchResult } from "@/types/domain";

export interface ImageMatch {
  locationImageId: string;
  locationId: string;
  similarity: number;
}

export function groupImageMatches(matches: ImageMatch[], locations: Location[], limit = 8): LocationSearchResult[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const best = new Map<string, ImageMatch>();
  for (const match of matches) {
    if (!Number.isFinite(match.similarity) || !byId.has(match.locationId)) continue;
    const previous = best.get(match.locationId);
    if (!previous || match.similarity > previous.similarity) best.set(match.locationId, match);
  }
  return [...best.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((match) => ({
      location: byId.get(match.locationId)!,
      similarity: match.similarity,
      matchedImageId: match.locationImageId,
    }));
}
