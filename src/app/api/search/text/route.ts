import { NextResponse } from "next/server";
import { searchByText } from "@/domains/locations/server/repository";
import { enrichWithNvidiaIntent } from "@/domains/search/server/nvidia-intent-adapter";
import { resolveTextSearchFilters } from "@/domains/search/server/text-search-filter-resolution";
import { parseTextSearchQuery } from "@/domains/search/server/text-query-parser";
import { describeTextSearchRequestError } from "@/domains/search/server/validation";
import { validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { MAX_TEXT_SEARCH_REQUEST_BYTES, textSearchRequestSchema } from "@/types/contracts";
import type { TextSearchNotice, TextSearchResponse } from "@/types/text-search";

const BODY_TOO_LARGE_MESSAGE = "요청 본문이 너무 큽니다.";

// Requirement 7: a non-Busan region request gets an honest empty result
// plus this fixed notice, not a 400 -- the request itself was well-formed,
// it's just outside the catalog's current scope.
const OUT_OF_SCOPE_NOTICE: TextSearchNotice = {
  code: "OUT_OF_SCOPE_REGION",
  message: "현재는 부산 지역만 검색할 수 있습니다. 다른 지역은 아직 지원하지 않습니다.",
};

export async function POST(request: Request) {
  // Same streamed-read-with-cap approach as POST /api/search (route.ts) --
  // duplicated rather than extracted, so this new route never risks
  // changing the existing image-search route's behavior.
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_TEXT_SEARCH_REQUEST_BYTES) {
    return apiErrorResponse(validationError(BODY_TOO_LARGE_MESSAGE), "search.text.body-size");
  }

  let bodyText: string;
  try {
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    bodyText = "";
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_TEXT_SEARCH_REQUEST_BYTES) {
            await reader.cancel().catch(() => undefined);
            return apiErrorResponse(validationError(BODY_TOO_LARGE_MESSAGE), "search.text.body-size");
          }
          bodyText += decoder.decode(value, { stream: true });
        }
        bodyText += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
  } catch {
    return apiErrorResponse(validationError("요청 본문을 읽을 수 없습니다."), "search.text.read");
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return apiErrorResponse(validationError("요청 형식이 올바르지 않습니다."), "search.text.parse");
  }

  const parsed = textSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiErrorResponse(validationError(describeTextSearchRequestError(parsed.error)), "search.text.validate");
  }

  const parsedQuery = parseTextSearchQuery(parsed.data.query);

  if (parsedQuery.outOfScope) {
    const response: TextSearchResponse = {
      results: [],
      parsedQuery: { district: null, category: null, keywords: [], districtConflict: false },
      unsupportedConditions: [],
      notice: OUT_OF_SCOPE_NOTICE,
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  }

  // Optional P1 enrichment: NVIDIA only ever restructures district/
  // category/keywords/unsupportedConditions on top of the base rule-based
  // parse above -- it never decides outOfScope (already handled) and never
  // performs the actual search itself (still searchByText below, same as
  // without it). A no-op (returns `parsedQuery` unchanged) whenever the
  // feature flag is off, no API key is configured, the call budget is
  // exhausted, or the call fails for any reason -- see
  // enrichWithNvidiaIntent's own doc comment.
  const enrichedQuery = await enrichWithNvidiaIntent(parsed.data.query, parsedQuery);

  // Explicit `filters.district`/`filters.category` (if given) always win
  // over whatever district/category ended up on `enrichedQuery` (from the
  // query text itself, or from NVIDIA) -- resolveTextSearchFilters reports
  // a FILTER_OVERRIDES_QUERY notice when they disagree, so the UI never
  // silently drops a condition the query text asked for.
  const { district, category, notice: filterNotice } = resolveTextSearchFilters(enrichedQuery, parsed.data.filters ?? {});

  try {
    const results = await searchByText({ ...enrichedQuery, district, category });
    const response: TextSearchResponse = {
      results,
      parsedQuery: {
        district,
        category,
        keywords: enrichedQuery.keywords,
        districtConflict: enrichedQuery.districtConflict,
      },
      unsupportedConditions: enrichedQuery.unsupportedConditions,
      notice: filterNotice,
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "search.text.execute");
  }
}
