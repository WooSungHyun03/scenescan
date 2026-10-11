import "server-only";

import { publicEnv } from "@/env/public";
import { createFakeKakaoLocalAdapter } from "@/infrastructure/kakao/fake-local-adapter";
import { getKakaoLocalAdapter } from "@/infrastructure/kakao/local-client-factory";
import { KakaoLocalError } from "@/infrastructure/kakao/local-error";
import {
  dataAccessError,
  notFoundError,
  rateLimitedError,
  validationError,
} from "@/shared/errors/application-error";
import type { Location } from "@/types/domain";
import type { DiscoveredPlace, PlaceDiscoveryAdapter } from "@/types/place-discovery";
import type { LocationContactsResponse } from "@/types/location-contact";
import {
  busanReviewedContacts,
  findReviewedLocationContacts,
  type ReviewedContactFile,
} from "../services/contact-review";
import { resolveLocationContacts } from "../services/contact-resolver";
import { getLocation } from "./repository";

type ContactDependencies = {
  location?: Location | null;
  adapter?: PlaceDiscoveryAdapter | null;
  reviewedFile?: ReviewedContactFile;
  sourceMode?: "live" | "fixture";
  now?: Date;
};

function stableDigits(value: string): string {
  let result = 23;
  for (const character of value) result = (result * 33 + character.charCodeAt(0)) % 1_000_000_000;
  return String(result).padStart(9, "0");
}

/** Synthetic contact candidates are isolated to mock mode and are explicitly
 * labelled by the response; they are never written to the reviewed file. */
export function createContactFixtureAdapter(location: Location): PlaceDiscoveryAdapter {
  const base = stableDigits(location.id);
  const venueId = `${base}1`;
  const cafeId = `${base}2`;
  const places: DiscoveredPlace[] = [
    {
      id: venueId,
      name: location.name,
      categoryName: "문화,예술 > 개발용 장소",
      categoryGroupCode: "CT1",
      categoryGroupName: "문화시설",
      phone: "051-000-0101",
      address: location.address,
      roadAddress: location.address,
      point: {
        latitude: location.point.latitude + 0.0001,
        longitude: location.point.longitude + 0.0001,
      },
      placeUrl: `https://place.map.kakao.com/${venueId}`,
      distanceMeters: null,
      source: "Kakao Local",
    },
    {
      id: cafeId,
      name: `${location.name} 앞 개발용 카페`,
      categoryName: "음식점 > 카페",
      categoryGroupCode: "CE7",
      categoryGroupName: "카페",
      phone: "051-000-0102",
      address: location.address,
      roadAddress: location.address,
      point: location.point,
      placeUrl: `https://place.map.kakao.com/${cafeId}`,
      distanceMeters: null,
      source: "Kakao Local",
    },
  ];
  return createFakeKakaoLocalAdapter(places);
}

function mapProviderError(error: unknown): never {
  if (!(error instanceof KakaoLocalError)) {
    throw dataAccessError("Location contact provider failed", error);
  }
  if (error.code === "QUOTA") throw rateLimitedError("Kakao Local quota exceeded", 60);
  if (error.code === "VALIDATION") throw validationError("연락처 검색 조건이 올바르지 않습니다.");
  throw dataAccessError(`Kakao Local contact lookup failed: ${error.code}`, error);
}

export async function getLocationContacts(
  locationId: string,
  signal?: AbortSignal,
  dependencies: ContactDependencies = {},
): Promise<LocationContactsResponse> {
  const location = dependencies.location !== undefined
    ? dependencies.location
    : await getLocation(locationId);
  if (!location) throw notFoundError(`Location ${locationId} not found`);

  const sourceMode = dependencies.sourceMode ?? (publicEnv.useMockData ? "fixture" : "live");
  const resolutionNow = dependencies.now
    ?? (sourceMode === "fixture" ? new Date("2026-01-01T00:00:00Z") : undefined);
  const reviewed = findReviewedLocationContacts(
    location,
    dependencies.reviewedFile ?? busanReviewedContacts,
  );

  // Resolve official data first. Passing no provider prevents a reviewed
  // management/permit contact from being supplemented or replaced by Kakao.
  const official = resolveLocationContacts({
    location,
    reviewed,
    providerAvailable: false,
    sourceMode,
    now: resolutionNow,
  });
  if (official.resolution === "official" || official.reason === "large_site_requires_review") {
    return official;
  }

  const adapter = dependencies.adapter !== undefined
    ? dependencies.adapter
    : sourceMode === "fixture"
      ? createContactFixtureAdapter(location)
      : getKakaoLocalAdapter();
  if (!adapter) {
    return resolveLocationContacts({
      location, reviewed, providerAvailable: false, sourceMode, now: resolutionNow,
    });
  }

  try {
    const page = await adapter.searchByKeyword({
      query: location.name,
      center: location.point,
      radiusMeters: 500,
      page: 1,
      size: 5,
      sort: "distance",
    }, { signal });
    return resolveLocationContacts({
      location,
      reviewed,
      providerPlaces: page.places,
      providerAvailable: true,
      sourceMode,
      now: resolutionNow,
    });
  } catch (error) {
    return mapProviderError(error);
  }
}
