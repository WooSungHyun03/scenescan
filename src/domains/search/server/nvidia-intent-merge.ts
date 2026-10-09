import type { NvidiaIntentResult } from "@/infrastructure/nvidia/intent-contract";
import type { ParsedTextSearchQuery } from "@/types/text-search";

function dedupe(items: readonly string[]): string[] {
  return [...new Set(items)];
}

/**
 * Layers a validated NVIDIA intent result on top of the base rule-based
 * parse (ticket 3's parseTextSearchQuery) -- never a replacement for it.
 * Only district/category/keywords/unsupportedConditions are ever touched
 * (requirement: "NVIDIA는 검색 의도 구조화에만 쓴다"); `outOfScope` is
 * decided by the base parser alone and is never reached here (the caller
 * short-circuits out-of-scope queries before NVIDIA is even considered).
 *
 * The base rule-based parser is always trusted first:
 *
 * - district/category: the base parser's own value wins whenever it found
 *   one. NVIDIA only ever fills a slot the base parser left null --
 *   never overrides a value the base parser already committed to.
 * - districtConflict: if the base parser already detected two different
 *   districts named in the query text, that conflict (and `district:
 *   null`) is kept exactly as-is, regardless of what NVIDIA returns --
 *   NVIDIA is never allowed to silently resolve an ambiguity the rule-based
 *   scanner flagged. (`...base` below already carries `districtConflict`/
 *   `conflictingDistricts` through unchanged; this function never writes
 *   either field.)
 * - keywords/unsupportedConditions: these are unioned (deduplicated), not
 *   replaced -- NVIDIA can only ever ADD a condition it noticed, never
 *   remove one the base parser already found, and anything NVIDIA adds to
 *   `unsupportedConditions` gets exactly the same "확인 불가" treatment as
 *   the base parser's own entries (src/app/api/search/text/route.ts never
 *   distinguishes the two sources).
 *
 * UI-selected `filters.district`/`filters.category` are NOT handled here
 * at all -- resolveTextSearchFilters (text-search-filter-resolution.ts)
 * applies on top of this function's output and always wins on a conflict,
 * unaffected by whether the value it's overriding came from the base
 * parser or from NVIDIA.
 *
 * Type-only imports only (no runtime dependency) so this module is safe to
 * import from both the Next.js-side adapter (nvidia-intent-adapter.ts,
 * server-only-guarded) and the plain-Node eval script
 * (scripts/nvidia/evaluate-intent.ts) without pulling in anything
 * `server-only`.
 */
export function applyNvidiaIntentOverride(
  base: ParsedTextSearchQuery,
  nvidia: NvidiaIntentResult,
): ParsedTextSearchQuery {
  return {
    ...base,
    district: base.districtConflict ? base.district : (base.district ?? nvidia.district),
    category: base.category ?? nvidia.category,
    keywords: dedupe([...base.keywords, ...nvidia.keywords]),
    unsupportedConditions: dedupe([...base.unsupportedConditions, ...nvidia.unsupportedConditions]),
  };
}
