import {
  SHORTLIST_WRITE_CSRF_HEADER,
  SHORTLIST_WRITE_CSRF_VALUE,
  shortlistMergeResponseSchema,
  shortlistResponseSchema,
  type ShortlistMergeResponse,
  type ShortlistResponse,
} from "@/types/contracts";

type ErrorBody = { error?: { message?: string } };

export class ShortlistClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ShortlistClientError";
    this.status = status;
  }
}

function errorMessage(status: number, body: ErrorBody | null): string {
  if (status === 401) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  if (status === 403) return "관심 장소를 변경할 권한을 확인하지 못했습니다.";
  if (status === 404) return "삭제되었거나 사용할 수 없는 장소입니다.";
  if (status === 429) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  return body?.error?.message ?? "관심 장소를 동기화하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

async function parseResponse<T>(
  response: Response,
  parser: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Invalid JSON is handled as an unavailable shortlist response below.
  }
  if (!response.ok) throw new ShortlistClientError(errorMessage(response.status, body as ErrorBody | null), response.status);
  const parsed = parser.safeParse(body);
  if (!parsed.success) throw new ShortlistClientError("관심 장소 응답을 확인할 수 없습니다.", 503);
  return parsed.data;
}

export async function loadAccountShortlist(
  fetcher: typeof fetch = fetch,
): Promise<ShortlistResponse> {
  const response = await fetcher("/api/shortlist", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseResponse(response, shortlistResponseSchema);
}

export async function setAccountShortlistLocation(
  locationId: string,
  saved: boolean,
  fetcher: typeof fetch = fetch,
): Promise<ShortlistResponse> {
  const response = await fetcher("/api/shortlist", {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      [SHORTLIST_WRITE_CSRF_HEADER]: SHORTLIST_WRITE_CSRF_VALUE,
    },
    body: JSON.stringify({ locationId, saved }),
  });
  return parseResponse(response, shortlistResponseSchema);
}

export async function mergeBrowserShortlist(
  locationIds: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<ShortlistMergeResponse> {
  const response = await fetcher("/api/shortlist", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      [SHORTLIST_WRITE_CSRF_HEADER]: SHORTLIST_WRITE_CSRF_VALUE,
    },
    body: JSON.stringify({ locationIds }),
  });
  return parseResponse(response, shortlistMergeResponseSchema);
}
