import type { District, Location, LocationCategory } from "./domain";

// Where a keyword was found. Image search's `similarity` (cosine) is a
// different kind of signal entirely -- this type deliberately has no
// numeric confidence field that could be confused with it (see `score` on
// TextSearchResult below, which is an integer keyword-match count, never a
// similarity value).
export type TextSearchMatchField = "name" | "alias" | "description" | "tag";

export interface TextSearchMatchReason {
  field: TextSearchMatchField;
  keyword: string;
}

// Raw location_id + score pair before metadata hydration -- what both the
// mock and Supabase text-search backends produce, mirroring ImageMatch's
// role for image search (src/domains/locations/services/group-image-matches.ts).
export interface TextSearchHit {
  locationId: string;
  score: number;
}

export interface TextSearchResult {
  location: Location;
  // Deterministic integer count of distinct keywords that matched this
  // location (across name/alias/description/tag) -- never a cosine
  // similarity value, never reused from image search.
  score: number;
  matchedOn: TextSearchMatchReason[];
}

// Output of the rule-based (no external AI) natural-language parser --
// see src/domains/search/server/text-query-parser.ts and the curated
// alias dictionary in src/domains/search/server/text-search-aliases.ts.
export interface ParsedTextSearchQuery {
  district: District | null;
  category: LocationCategory | null;
  // Free-text tokens left over after district/category aliases and known
  // unsupported-condition phrases are stripped from the query.
  keywords: string[];
  // true when the query named two or more different districts (e.g. "해운대
  // 서면 사진") -- `district` is null in that case; never guessed.
  districtConflict: boolean;
  conflictingDistricts: District[];
  // true when the query named a region other than Busan (e.g. "서울 카페").
  // Short-circuits the whole request -- see TextSearchNotice below.
  outOfScope: boolean;
  // Condition phrases detected (e.g. "조용함", "촬영 가능") that the catalog
  // has no verified data for. Never used to filter or score results, and
  // never implied as satisfied by a result -- see docs/api-contracts.md.
  unsupportedConditions: string[];
}

// "FILTER_OVERRIDES_QUERY": the request's explicit `filters.district`/
// `filters.category` (src/types/contracts.ts's textSearchRequestSchema)
// named a different district/category than the query text itself did --
// see resolveTextSearchFilters (src/domains/search/server/
// text-search-filter-resolution.ts). The filter always wins; this notice
// only explains why the search didn't follow the query text literally.
export type TextSearchNoticeCode = "OUT_OF_SCOPE_REGION" | "FILTER_OVERRIDES_QUERY";

export interface TextSearchNotice {
  code: TextSearchNoticeCode;
  message: string;
}

export interface TextSearchResponse {
  results: TextSearchResult[];
  parsedQuery: {
    // The district/category actually used for this search -- i.e. after
    // resolveTextSearchFilters merges the query text's own district/
    // category with the request's explicit `filters` (an explicit filter
    // always wins on a conflict; see TextSearchNoticeCode above). Not
    // simply "what the query text named" when a filter was also supplied.
    district: District | null;
    category: LocationCategory | null;
    keywords: string[];
    districtConflict: boolean;
  };
  unsupportedConditions: string[];
  notice: TextSearchNotice | null;
}
