import { mockLocations } from "@/domains/locations/fixtures/locations";
import { SEARCH_MATCH_COUNT_DEFAULT, SEARCH_MATCH_THRESHOLD_DEFAULT } from "@/types/contracts";
import type { LocationFilter, LocationListQuery, LocationSearchResult, SearchQueryOptions } from "@/types/domain";
import { groupImageMatches, type ImageMatch } from "@/domains/locations/services/group-image-matches";
import { rankSimilarLocations } from "@/domains/locations/services/similar-locations";
import { resolveLocationListPagination } from "./pagination";

function compareLocations(left: { name: string; id: string }, right: { name: string; id: string }): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function filterLocations(query: LocationFilter) {
  return mockLocations.filter((location) =>
    (!query.region || location.region === query.region) &&
    (!query.category || location.category === query.category),
  );
}

export function getMockLocations(query: LocationListQuery = {}) {
  // Deterministic order (name, then id as a tiebreaker) matches the
  // .order("name").order("id") added to getSupabaseLocations -- required
  // now that both are paginated via limit/offset, where an unstable sort
  // would shift rows across page boundaries.
  const filtered = filterLocations(query).slice().sort(compareLocations);
  const { limit, offset } = resolveLocationListPagination(query);
  return filtered.slice(offset, offset + limit);
}

export function getMockLocation(id: string) {
  return mockLocations.find((location) => location.id === id) ?? null;
}

export function searchMockLocations(embedding: number[], filters: LocationFilter = {}, options: SearchQueryOptions = {}): LocationSearchResult[] {
  const threshold = options.threshold ?? SEARCH_MATCH_THRESHOLD_DEFAULT;
  const count = options.count ?? SEARCH_MATCH_COUNT_DEFAULT;
  // Stable synthetic scores exercise the full request/result flow without claiming real similarity.
  const phase = Math.abs(Math.round((embedding[0] ?? 0) * 1000)) % mockLocations.length;
  // Filter by region/category (and threshold) before grouping, mirroring
  // match_location_images's SQL-side filter_region/filter_category and
  // match_threshold -- the app no longer relies on groupImageMatches's
  // eligibleLocationIds set to enforce the filter after the fact.
  const eligible = filterLocations(filters);
  const eligibleIds = new Set(eligible.map((location) => location.id));
  const matches: ImageMatch[] = mockLocations
    .map((location, index) => ({
      locationImageId: location.images[0].id,
      locationId: location.id,
      similarity: 0.95 - (((index + phase) % mockLocations.length) * 0.035),
    }))
    .filter((match) => eligibleIds.has(match.locationId) && match.similarity >= threshold)
    .slice(0, count);
  return groupImageMatches(matches, eligible, 8);
}

export function getMockSimilarLocations(id: string, excludedIds: readonly string[] = []): LocationSearchResult[] {
  const current = getMockLocation(id);
  if (!current) return [];
  const matches = getMockLocations({ category: current.category }).filter((location) => !excludedIds.includes(location.id)).map((location, index) => ({
    locationId: location.id,
    locationImageId: location.images[0].id,
    similarity: location.id === id ? 1 : 0.8 - index * 0.04,
  }));
  return rankSimilarLocations(id, matches, mockLocations, 8);
}
