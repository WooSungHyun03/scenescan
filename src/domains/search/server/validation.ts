import type { z } from "zod";

// AGENTS.md: "Domain types and API request/response types live only in
// src/types/**." So searchRequestSchema itself stays in
// src/types/contracts.ts (reused, not duplicated here) even though the task
// that introduced this file suggested placing the schema under
// src/domains/search. This file holds only the route-facing glue that is
// genuinely search-specific: turning a failed Zod parse into a short,
// user-facing Korean sentence that never echoes Zod's internal issue text
// (field paths, schema internals) back to the client.
export function describeSearchRequestError(error: z.ZodError): string {
  const path = error.issues[0]?.path ?? [];
  const [field, subField] = path;

  if (field === "embedding") {
    return "이미지 임베딩 값이 올바르지 않습니다. 512개의 유효한 숫자로 이루어진 벡터여야 합니다.";
  }
  if (field === "filters") {
    if (subField === "region") return "허용되지 않는 지역입니다.";
    if (subField === "district") return "허용되지 않는 구/군입니다.";
    if (subField === "category") return "허용되지 않는 카테고리입니다.";
    return "검색 필터 값이 올바르지 않습니다.";
  }
  if (field === "threshold") return "threshold 값은 0에서 1 사이여야 합니다.";
  return "요청 값이 올바르지 않습니다.";
}

// POST /api/search/text's textSearchRequestSchema (src/types/contracts.ts)
// uses `.trim().min(1).max(...)` on the same `query` field, so a "too_small"
// zod issue code means blank/whitespace-only and "too_big" means over the
// length cap -- the field path alone can't distinguish them (both are
// ["query"]), unlike describeSearchRequestError's region/category/embedding
// fields above.
export function describeTextSearchRequestError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue?.code === "too_small") return "검색어를 입력해 주세요.";
  if (issue?.code === "too_big") return "검색어가 너무 깁니다. 200자 이하로 입력해 주세요.";
  return "검색어 형식이 올바르지 않습니다.";
}
