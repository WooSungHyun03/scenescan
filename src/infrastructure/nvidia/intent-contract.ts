import { z } from "zod";
import type { District, LocationCategory } from "@/types/domain";
import { DISTRICT_VALUES, LOCATION_CATEGORY_VALUES } from "@/types/location-options";

// Requirement 1: NVIDIA's structured response is allowed to contain
// *exactly* these four fields. A plain (non-.strict()) z.object already
// drops any other top-level field from the parsed result for free -- the
// model hallucinating a 5th field, or wrapping its answer in extra
// metadata, never reaches the caller. `district`/`category` only ever
// validate against this project's single 1차 definitions
// (DISTRICT_VALUES/LOCATION_CATEGORY_VALUES, src/types/location-options.ts)
// -- the same values POST /api/search/text's own filters validate against.
const MAX_LIST_ITEMS = 16;
const MAX_ITEM_LENGTH = 60;

const shortString = z.string().trim().min(1).max(MAX_ITEM_LENGTH);

export const nvidiaIntentResponseSchema = z.object({
  district: z.enum(DISTRICT_VALUES).nullable().default(null),
  category: z.enum(LOCATION_CATEGORY_VALUES).nullable().default(null),
  keywords: z.array(shortString).max(MAX_LIST_ITEMS).default([]),
  unsupportedConditions: z.array(shortString).max(MAX_LIST_ITEMS).default([]),
});

export type NvidiaIntentResult = {
  district: District | null;
  category: LocationCategory | null;
  keywords: string[];
  unsupportedConditions: string[];
};

/**
 * Never throws. Any schema violation -- a disallowed district/category
 * value, a wrong type, a missing object, the response not being an object
 * at all -- returns null rather than a partially-trusted result; callers
 * always fall back to the base rule-based parser in that case (requirement
 * 1/5). This is the one place "출력이 이상하면 기본 검색으로 fallback" is
 * decided; nothing downstream needs its own leniency logic.
 */
export function parseNvidiaIntentResponse(raw: unknown): NvidiaIntentResult | null {
  const result = nvidiaIntentResponseSchema.safeParse(raw);
  return result.success ? result.data : null;
}
