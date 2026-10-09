import type { TextSearchFilters } from "@/types/contracts";
import type { ParsedTextSearchQuery, TextSearchNotice } from "@/types/text-search";

export interface ResolvedTextSearchFilters {
  district: ParsedTextSearchQuery["district"];
  category: ParsedTextSearchQuery["category"];
  notice: TextSearchNotice | null;
}

/**
 * Merges the query text's own district/category (from parseTextSearchQuery)
 * with the request's explicit `filters` (POST /api/search/text's optional
 * `filters.district`/`filters.category`). An explicit filter always wins
 * when both are present and disagree -- the caller chose it deliberately,
 * unlike a district/category merely inferred from free text -- and the
 * returned notice names exactly which field(s) were overridden so the UI
 * never silently drops what the query text asked for. When only one side
 * names a value (or both agree), there is nothing to explain: no notice.
 */
export function resolveTextSearchFilters(
  parsedQuery: ParsedTextSearchQuery,
  filters: TextSearchFilters,
): ResolvedTextSearchFilters {
  const districtOverridden = filters.district !== undefined && parsedQuery.district !== null && filters.district !== parsedQuery.district;
  const categoryOverridden = filters.category !== undefined && parsedQuery.category !== null && filters.category !== parsedQuery.category;

  const district = filters.district ?? parsedQuery.district;
  const category = filters.category ?? parsedQuery.category;

  if (!districtOverridden && !categoryOverridden) {
    return { district, category, notice: null };
  }

  const overriddenLabels = [districtOverridden && "지역", categoryOverridden && "공간 종류"].filter((label): label is string => Boolean(label));
  return {
    district,
    category,
    notice: {
      code: "FILTER_OVERRIDES_QUERY",
      message: `검색어에서 인식한 ${overriddenLabels.join("·")} 조건이 선택한 필터와 달라, 필터 조건을 우선 적용했습니다.`,
    },
  };
}
