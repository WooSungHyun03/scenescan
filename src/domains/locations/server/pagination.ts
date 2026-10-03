import { LOCATION_LIST_DEFAULT_LIMIT, LOCATION_LIST_MAX_LIMIT } from "@/types/contracts";
import type { LocationListQuery } from "@/types/domain";

export type ResolvedLocationListPagination = { limit: number; offset: number };

/**
 * Defensive, non-throwing clamp applied inside the repository layer itself
 * (mock and Supabase alike), independent of any upstream Zod validation.
 * Invalid/missing limit falls back to the default; invalid/negative offset
 * falls back to 0. This never rejects -- rejecting bad input is the
 * validation layer's job (see locationListQuerySchema in
 * src/types/contracts.ts); this is the second, always-on line of defense so
 * a caller that skips validation still can't exceed the cap.
 */
export function resolveLocationListPagination(query: Pick<LocationListQuery, "limit" | "offset"> = {}): ResolvedLocationListPagination {
  const limit = Number.isInteger(query.limit) && query.limit! > 0
    ? Math.min(query.limit!, LOCATION_LIST_MAX_LIMIT)
    : LOCATION_LIST_DEFAULT_LIMIT;
  const offset = Number.isInteger(query.offset) && query.offset! >= 0 ? query.offset! : 0;
  return { limit, offset };
}
