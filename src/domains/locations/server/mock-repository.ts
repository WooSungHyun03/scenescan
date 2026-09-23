import { mockLocations } from "@/domains/locations/fixtures/locations";
import type { LocationFilter, LocationSearchResult } from "@/types/domain";
import { groupImageMatches, type ImageMatch } from "@/domains/locations/services/group-image-matches";

export function getMockLocations(filters: LocationFilter = {}) {
  return mockLocations.filter((location) =>
    (!filters.region || location.region === filters.region) &&
    (!filters.category || location.category === filters.category),
  );
}

export function getMockLocation(id: string) {
  return mockLocations.find((location) => location.id === id) ?? null;
}

export function searchMockLocations(embedding: number[], filters: LocationFilter = {}): LocationSearchResult[] {
  // Stable synthetic scores exercise the full request/result flow without claiming real similarity.
  const phase = Math.abs(Math.round((embedding[0] ?? 0) * 1000)) % mockLocations.length;
  const matches: ImageMatch[] = mockLocations.map((location, index) => ({
    locationImageId: location.images[0].id,
    locationId: location.id,
    similarity: 0.95 - (((index + phase) % mockLocations.length) * 0.035),
  }));
  return groupImageMatches(matches, getMockLocations(filters), 8);
}

export function getMockSimilarLocations(id: string): LocationSearchResult[] {
  const current = getMockLocation(id);
  if (!current) return [];
  return getMockLocations({ category: current.category })
    .filter((location) => location.id !== id)
    .slice(0, 8)
    .map((location, index) => ({ location, similarity: 0.8 - index * 0.04, matchedImageId: location.images[0].id }));
}
