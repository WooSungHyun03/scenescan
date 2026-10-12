import "server-only";

import { z } from "zod";
import {
  KAKAO_CATEGORY_GROUP_CODES,
  categoryPlaceSearchRequestSchema,
  keywordPlaceSearchRequestSchema,
  placeDiscoveryPageSchema,
  type CategoryPlaceSearchRequest,
  type DiscoveredPlace,
  type KakaoCategoryGroupCode,
  type KeywordPlaceSearchRequest,
  type PlaceDiscoveryAdapter,
  type PlaceDiscoveryPage,
  type PlaceDiscoveryRequestOptions,
} from "@/types/place-discovery";
import { KakaoLocalError } from "./local-error";

export { KakaoLocalError } from "./local-error";

const KAKAO_LOCAL_ORIGIN = "https://dapi.kakao.com";
const KAKAO_KEYWORD_PATH = "/v2/local/search/keyword.json";
const KAKAO_CATEGORY_PATH = "/v2/local/search/category.json";
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000;

const rawDocumentSchema = z.object({
  id: z.string().regex(/^\d+$/u),
  place_name: z.string().trim().min(1),
  category_name: z.string(),
  category_group_code: z.string(),
  category_group_name: z.string(),
  phone: z.string(),
  address_name: z.string(),
  road_address_name: z.string(),
  x: z.string(),
  y: z.string(),
  place_url: z.string(),
  distance: z.string(),
});

const rawResponseSchema = z.object({
  meta: z.object({
    total_count: z.number().int().nonnegative(),
    pageable_count: z.number().int().nonnegative().max(45),
    is_end: z.boolean(),
  }),
  documents: z.array(rawDocumentSchema).max(15),
});

export type KakaoLocalClientOptions = {
  restApiKey: string | undefined;
  fetcher?: typeof fetch;
  timeoutMilliseconds?: number;
};

type ParsedKeywordRequest = z.output<typeof keywordPlaceSearchRequestSchema>;
type ParsedCategoryRequest = z.output<typeof categoryPlaceSearchRequestSchema>;

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function categoryCode(value: string): KakaoCategoryGroupCode | null {
  return KAKAO_CATEGORY_GROUP_CODES.includes(value as KakaoCategoryGroupCode)
    ? value as KakaoCategoryGroupCode
    : null;
}

function parseCoordinate(value: string, minimum: number, maximum: number): number {
  const trimmed = value.trim();
  // Number("") invents a zero coordinate and Number("0x10") accepts a
  // non-geographic encoding. The provider contract supplies decimal strings.
  if (!/^[+-]?\d+(?:\.\d+)?$/u.test(trimmed)) {
    throw new KakaoLocalError("MALFORMED_RESPONSE", "Kakao Local returned invalid coordinates");
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new KakaoLocalError("MALFORMED_RESPONSE", "Kakao Local returned invalid coordinates");
  }
  return parsed;
}

function parseDistance(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/u.test(trimmed)) {
    throw new KakaoLocalError("MALFORMED_RESPONSE", "Kakao Local returned an invalid distance");
  }
  const distance = Number(trimmed);
  if (!Number.isSafeInteger(distance)) {
    throw new KakaoLocalError("MALFORMED_RESPONSE", "Kakao Local returned an invalid distance");
  }
  return distance;
}

/**
 * Kakao currently returns HTTP place links in its official examples. Keep only
 * its exact place host and numeric path, then emit a canonical HTTPS link.
 */
export function sanitizeKakaoPlaceUrl(value: string, placeId: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || url.hostname !== "place.map.kakao.com"
      || url.port
      || url.username
      || url.password
      || url.search
      || url.hash
      || url.pathname.replace(/\/$/u, "") !== `/${placeId}`
    ) return null;
    return `https://place.map.kakao.com/${placeId}`;
  } catch {
    return null;
  }
}

function normalizeDocument(document: z.infer<typeof rawDocumentSchema>): DiscoveredPlace {
  return {
    id: document.id,
    name: document.place_name,
    categoryName: optionalText(document.category_name),
    categoryGroupCode: categoryCode(document.category_group_code),
    categoryGroupName: optionalText(document.category_group_name),
    phone: optionalText(document.phone),
    address: optionalText(document.address_name),
    roadAddress: optionalText(document.road_address_name),
    point: {
      latitude: parseCoordinate(document.y, -90, 90),
      longitude: parseCoordinate(document.x, -180, 180),
    },
    placeUrl: sanitizeKakaoPlaceUrl(document.place_url, document.id),
    distanceMeters: parseDistance(document.distance),
    source: "Kakao Local",
  };
}

function appendCommonParameters(
  url: URL,
  request: ParsedKeywordRequest | ParsedCategoryRequest,
): void {
  url.searchParams.set("page", String(request.page));
  url.searchParams.set("size", String(request.size));
  url.searchParams.set("sort", request.sort);
  if (request.center) {
    url.searchParams.set("x", String(request.center.longitude));
    url.searchParams.set("y", String(request.center.latitude));
  }
  if (request.radiusMeters !== undefined) {
    url.searchParams.set("radius", String(request.radiusMeters));
  }
}

function parseRequest<T>(schema: z.ZodType<T>, request: unknown): T {
  const result = schema.safeParse(request);
  if (!result.success) {
    throw new KakaoLocalError("VALIDATION", "Kakao Local search parameters are invalid", {
      cause: result.error,
    });
  }
  return result.data;
}

export class KakaoLocalClient implements PlaceDiscoveryAdapter {
  private readonly restApiKey: string | undefined;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(options: KakaoLocalClientOptions) {
    this.restApiKey = options.restApiKey?.trim() || undefined;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
    if (!Number.isFinite(this.timeoutMilliseconds) || this.timeoutMilliseconds <= 0) {
      throw new KakaoLocalError("VALIDATION", "Kakao Local timeout must be a positive number");
    }
  }

  async searchByKeyword(
    request: KeywordPlaceSearchRequest,
    options: PlaceDiscoveryRequestOptions = {},
  ): Promise<PlaceDiscoveryPage> {
    const parsed = parseRequest(keywordPlaceSearchRequestSchema, request);
    const url = new URL(KAKAO_KEYWORD_PATH, KAKAO_LOCAL_ORIGIN);
    url.searchParams.set("query", parsed.query);
    if (parsed.categoryGroupCode) {
      url.searchParams.set("category_group_code", parsed.categoryGroupCode);
    }
    appendCommonParameters(url, parsed);
    return this.search(url, parsed.page, parsed.size, options.signal);
  }

  async searchByCategory(
    request: CategoryPlaceSearchRequest,
    options: PlaceDiscoveryRequestOptions = {},
  ): Promise<PlaceDiscoveryPage> {
    const parsed = parseRequest(categoryPlaceSearchRequestSchema, request);
    const url = new URL(KAKAO_CATEGORY_PATH, KAKAO_LOCAL_ORIGIN);
    url.searchParams.set("category_group_code", parsed.categoryGroupCode);
    appendCommonParameters(url, parsed);
    return this.search(url, parsed.page, parsed.size, options.signal);
  }

  private async search(
    url: URL,
    page: number,
    size: number,
    externalSignal: AbortSignal | undefined,
  ): Promise<PlaceDiscoveryPage> {
    if (!this.restApiKey) {
      throw new KakaoLocalError(
        "CONFIGURATION",
        "KAKAO_LOCAL_REST_API_KEY is not configured",
      );
    }
    if (externalSignal?.aborted) {
      throw new KakaoLocalError("CANCELLED", "Kakao Local request was cancelled");
    }

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), this.timeoutMilliseconds);
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await this.fetcher(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `KakaoAK ${this.restApiKey}`,
        },
        cache: "no-store",
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new KakaoLocalError("FORBIDDEN", "Kakao Local REST API key was rejected");
      }
      if (response.status === 429) {
        throw new KakaoLocalError("QUOTA", "Kakao Local quota was exceeded");
      }
      if (!response.ok) {
        throw new KakaoLocalError("UPSTREAM", `Kakao Local request failed (${response.status})`);
      }

      const raw = await response.json().catch((cause: unknown) => {
        // Body reads share the request deadline and cancellation signal.
        // Let the outer boundary classify aborts instead of masking them as JSON errors.
        if (signal.aborted) throw cause;
        throw new KakaoLocalError("MALFORMED_RESPONSE", "Kakao Local returned invalid JSON");
      });
      const parsed = rawResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new KakaoLocalError(
          "MALFORMED_RESPONSE",
          "Kakao Local response did not match its contract",
          { cause: parsed.error },
        );
      }

      const seenIds = new Set<string>();
      const places = parsed.data.documents.flatMap((document) => {
        if (seenIds.has(document.id)) return [];
        seenIds.add(document.id);
        return [normalizeDocument(document)];
      });
      return placeDiscoveryPageSchema.parse({
        places,
        page,
        size,
        totalCount: parsed.data.meta.total_count,
        pageableCount: parsed.data.meta.pageable_count,
        isEnd: parsed.data.meta.is_end,
      });
    } catch (error) {
      if (error instanceof KakaoLocalError) throw error;
      if (externalSignal?.aborted) {
        throw new KakaoLocalError("CANCELLED", "Kakao Local request was cancelled", {
          cause: error,
        });
      }
      if (timeoutController.signal.aborted) {
        throw new KakaoLocalError("TIMEOUT", "Kakao Local request timed out", {
          cause: error,
        });
      }
      throw new KakaoLocalError("UPSTREAM", "Kakao Local request failed", { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }
}
