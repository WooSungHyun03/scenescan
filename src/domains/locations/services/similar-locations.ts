import type { Location, LocationSearchResult } from "@/types/domain";
import { groupImageMatches, type ImageMatch } from "./group-image-matches";

export function rankSimilarLocations(
  selectedLocationId: string,
  matches: readonly ImageMatch[],
  locations: readonly Location[],
  limit = 8,
): LocationSearchResult[] {
  if (!locations.some((location) => location.id === selectedLocationId)) return [];
  return groupImageMatches(
    matches.filter((match) => match.locationId !== selectedLocationId),
    locations.filter((location) => location.id !== selectedLocationId),
    limit,
  );
}
