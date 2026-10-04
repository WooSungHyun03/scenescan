import { NextResponse } from "next/server";
import { searchByImage } from "@/domains/locations/server/repository";
import { describeSearchRequestError } from "@/domains/search/server/validation";
import { validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { MAX_SEARCH_REQUEST_BYTES, searchRequestSchema } from "@/types/contracts";

const BODY_TOO_LARGE_MESSAGE = "요청 본문이 너무 큽니다.";

export async function POST(request: Request) {
  // Next.js Route Handlers have no built-in body size limit. Content-Length
  // is only a hint. Count actual streamed bytes and stop before buffering
  // an unlimited chunked body, even when the declared length is absent/false.
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_SEARCH_REQUEST_BYTES) {
    return apiErrorResponse(validationError(BODY_TOO_LARGE_MESSAGE), "search.body-size");
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
          if (bytes > MAX_SEARCH_REQUEST_BYTES) {
            await reader.cancel().catch(() => undefined);
            return apiErrorResponse(validationError(BODY_TOO_LARGE_MESSAGE), "search.body-size");
          }
          bodyText += decoder.decode(value, { stream: true });
        }
        bodyText += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
  } catch {
    return apiErrorResponse(validationError("요청 본문을 읽을 수 없습니다."), "search.read");
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
