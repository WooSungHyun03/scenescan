import {
  categoryPlaceSearchRequestSchema,
  keywordPlaceSearchRequestSchema,
  placeDiscoveryPageSchema,
  type CategoryPlaceSearchRequest,
  type DiscoveredPlace,
  type KeywordPlaceSearchRequest,
  type PlaceDiscoveryAdapter,
  type PlaceDiscoveryPage,
  type PlaceDiscoveryRequestOptions,
} from "@/types/place-discovery";
import { KakaoLocalError } from "./local-error";

const EARTH_RADIUS_METERS = 6_371_000;

function radians(value: number): number {
  return value * Math.PI / 180;
}

function distanceMeters(a: DiscoveredPlace["point"], b: DiscoveredPlace["point"]): number {
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.latitude))
      * Math.cos(radians(b.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

function cancelled(options: PlaceDiscoveryRequestOptions): void {
  if (options.signal?.aborted) {
    throw new KakaoLocalError("CANCELLED", "Kakao Local request was cancelled");
  }
}

function page(
  places: DiscoveredPlace[],
  request: {
    center?: DiscoveredPlace["point"];
    radiusMeters?: number;
    page: number;
    size: number;
    sort: "accuracy" | "distance";
  },
): PlaceDiscoveryPage {
  const measured = places.flatMap((place) => {
    const distance = request.center ? distanceMeters(request.center, place.point) : null;
    if (request.radiusMeters !== undefined && distance !== null && distance > request.radiusMeters) {
      return [];
    }
    return [{ ...place, distanceMeters: distance }];
  });
  if (request.sort === "distance") {
    measured.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  }
  const pageableCount = Math.min(measured.length, 45);
  const start = (request.page - 1) * request.size;
  const selected = measured.slice(start, Math.min(start + request.size, pageableCount));
  return placeDiscoveryPageSchema.parse({
    places: selected,
    page: request.page,
    size: request.size,
    totalCount: measured.length,
    pageableCount,
    isEnd: start + request.size >= pageableCount,
  });
}

/** Deterministic key-free provider for mock mode and consumer tests. */
export function createFakeKakaoLocalAdapter(seed: readonly DiscoveredPlace[]): PlaceDiscoveryAdapter {
  const uniquePlaces = [...new Map(seed.map((place) => [place.id, place])).values()];

  return {
    async searchByKeyword(
      input: KeywordPlaceSearchRequest,
      options: PlaceDiscoveryRequestOptions = {},
    ) {
      cancelled(options);
      const result = keywordPlaceSearchRequestSchema.safeParse(input);
      if (!result.success) {
        throw new KakaoLocalError("VALIDATION", "Kakao Local search parameters are invalid", {
          cause: result.error,
        });
      }
      const request = result.data;
      const query = request.query.toLocaleLowerCase("ko-KR");
      const matches = uniquePlaces.filter((place) => {
        if (request.categoryGroupCode && place.categoryGroupCode !== request.categoryGroupCode) {
          return false;
        }
        return [place.name, place.categoryName, place.address, place.roadAddress]
          .filter((value): value is string => value !== null)
          .some((value) => value.toLocaleLowerCase("ko-KR").includes(query));
      });
      return page(matches, request);
    },

    async searchByCategory(
      input: CategoryPlaceSearchRequest,
      options: PlaceDiscoveryRequestOptions = {},
    ) {
      cancelled(options);
      const result = categoryPlaceSearchRequestSchema.safeParse(input);
      if (!result.success) {
        throw new KakaoLocalError("VALIDATION", "Kakao Local search parameters are invalid", {
          cause: result.error,
        });
      }
      const request = result.data;
      return page(
        uniquePlaces.filter((place) => place.categoryGroupCode === request.categoryGroupCode),
        request,
      );
    },
  };
}
