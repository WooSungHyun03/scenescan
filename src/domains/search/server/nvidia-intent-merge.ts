import type { NvidiaIntentResult } from "@/infrastructure/nvidia/intent-contract";
import type { ParsedTextSearchQuery } from "@/types/text-search";

/**
 * Layers a validated NVIDIA intent result on top of the base rule-based
 * parse (ticket 3's parseTextSearchQuery) -- never a replacement for it.
 * Only district/category/keywords/unsupportedConditions are ever replaced
 * (requirement: "NVIDIA는 검색 의도 구조화에만 쓴다"); `outOfScope` is
 * decided by the base parser alone and is never reached here (the caller
 * short-circuits out-of-scope queries before NVIDIA is even considered).
 *
 * When NVIDIA confidently names a district, the base parser's own
 * in-query district conflict signal (`districtConflict`/
 * `conflictingDistricts`, set when the raw text itself named two
 * different districts) is cleared -- NVIDIA's job is exactly to
 * disambiguate intent the rule-based alias scanner could not, so a stale
 * conflict flag would only confuse the UI once a district has been
 * confidently chosen.
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
    district: nvidia.district,
    category: nvidia.category,
    keywords: nvidia.keywords,
    unsupportedConditions: nvidia.unsupportedConditions,
    districtConflict: nvidia.district !== null ? false : base.districtConflict,
    conflictingDistricts: nvidia.district !== null ? [] : base.conflictingDistricts,
  };
}
