import { NextResponse } from "next/server";
import { searchByImage } from "@/domains/locations/server/repository";
import { describeSearchRequestError } from "@/domains/search/server/validation";
import { validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { MAX_SEARCH_REQUEST_BYTES, searchRequestSchema } from "@/types/contracts";

const BODY_TOO_LARGE_MESSAGE = "요청 본문이 너무 큽니다.";

export async function POST(request: Request) {
  // Next.js Route Handlers have no built-in body size limit. Content-Length
  // is checked first to reject an obviously oversized body without reading
  // it, but it can be absent or wrong (chunked transfer, a lying client), so
  // the actual decoded text length is re-checked below before JSON.parse
  // ever sees it.
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_SEARCH_REQUEST_BYTES) {
    return apiErrorResponse(validationError(BODY_TOO_LARGE_MESSAGE), "search.body-size");
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return apiErrorResponse(validationError("요청 본문을 읽을 수 없습니다."), "search.read");
  }
  if (new TextEncoder().encode(bodyText).length > MAX_SEARCH_REQUEST_BYTES) {
    return apiErrorResponse(validationError(BODY_TOO_LARGE_MESSAGE), "search.body-size");
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return apiErrorResponse(validationError("요청 형식이 올바르지 않습니다."), "search.parse");
  }

  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiErrorResponse(validationError(describeSearchRequestError(parsed.error)), "search.validate");
  }

  try {
    const results = await searchByImage(parsed.data.embedding, parsed.data.filters, {
      threshold: parsed.data.threshold,
    });
    return NextResponse.json({ results });
  } catch (error) {
    return apiErrorResponse(error, "search.execute");
  }
}
