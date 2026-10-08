import type { Location } from "@/types/domain";
import type { TextSearchHit, TextSearchMatchReason, TextSearchResult } from "@/types/text-search";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function containsKeyword(haystack: string, keyword: string): boolean {
  return haystack.toLocaleLowerCase("ko-KR").includes(keyword.toLocaleLowerCase("ko-KR"));
}

function matchesAnyField(location: Location, keyword: string): boolean {
  return containsKeyword(location.name, keyword)
    || containsKeyword(location.description, keyword)
    || location.aliases.some((alias) => containsKeyword(alias, keyword))
    || location.tags.some((tag) => containsKeyword(tag, keyword));
}

/**
 * Mock-mode equivalent of search_locations_by_text's score computation
 * (supabase/migrations/20261009000000_text_search.sql): the count of
 * distinct keywords that hit at least one field, not the total number of
 * (keyword, field) hits -- a keyword matching both the name and a tag
 * still counts once, same as the SQL `count(*) from unnest(keywords) ...`.
 */
export function countMatchingKeywords(location: Location, keywords: readonly string[]): number {
  return keywords.filter((keyword) => keyword.trim().length > 0 && matchesAnyField(location, keyword)).length;
}

/**
 * Re-derives *why* a location matched, purely in application code, from
 * the same keyword list the SQL/mock backend already used to produce the
 * score. Cheap because it only runs over the final (at most 8) hydrated
 * results, not the full candidate set, and keeps the RPC from needing to
 * return structured per-field match data.
 */
export function buildMatchReasons(location: Location, keywords: readonly string[]): TextSearchMatchReason[] {
  const reasons: TextSearchMatchReason[] = [];
  for (const keyword of keywords) {
    if (containsKeyword(location.name, keyword)) reasons.push({ field: "name", keyword });
    if (location.aliases.some((alias) => containsKeyword(alias, keyword))) reasons.push({ field: "alias", keyword });
    if (containsKeyword(location.description, keyword)) reasons.push({ field: "description", keyword });
    if (location.tags.some((tag) => containsKeyword(tag, keyword))) reasons.push({ field: "tag", keyword });
  }
  return reasons;
}

/**
 * Deterministic score-descending / location-id-ascending sort (requirement
 * 4), re-applied in application code rather than trusted from the RPC's
 * own row order -- the same defensive stance groupImageMatches/
 * rankSimilarLocations already take toward Postgres/PostgREST row order.
 * `locations` only needs to contain the hydrated rows for `hits`; a hit
 * whose location failed to hydrate (should not happen in practice) is
 * dropped rather than thrown.
 */
export function rankTextSearchHits(
  hits: readonly TextSearchHit[],
  locations: readonly Location[],
  keywords: readonly string[],
  limit = 8,
): TextSearchResult[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  return hits
    .filter((hit) => byId.has(hit.locationId))
    .slice()
    .sort((left, right) => right.score - left.score || compareText(left.locationId, right.locationId))
    .slice(0, limit)
    .map((hit) => {
      const location = byId.get(hit.locationId)!;
      return { location, score: hit.score, matchedOn: buildMatchReasons(location, keywords) };
    });
}
