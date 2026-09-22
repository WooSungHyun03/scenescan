import type { Location, LocationSearchResult } from "@/types/domain";
import { rankLocationImageHits, type ImageSimilarityHit } from "@/lib/ai/location-ranking";

export type ImageMatch = ImageSimilarityHit;

export function groupImageMatches(matches: ImageMatch[], locations: Location[], limit = 8): LocationSearchResult[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  return rankLocationImageHits(matches, { eligibleLocationIds: new Set(byId.keys()), limit })
    .map((match) => ({
      location: byId.get(match.locationId)!,
      similarity: match.similarity,
      matchedImageId: match.matchedImageId,
    }));
}
