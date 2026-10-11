import "server-only";

import { publicEnv } from "@/env/public";
import { createFakeKakaoLocalAdapter } from "@/infrastructure/kakao/fake-local-adapter";
import { getKakaoLocalAdapter } from "@/infrastructure/kakao/local-client-factory";
import { KakaoLocalError } from "@/infrastructure/kakao/local-error";
import {
  configurationError,
  dataAccessError,
  notFoundError,
  rateLimitedError,
  validationError,
} from "@/shared/errors/application-error";
import type { GeoPoint } from "@/types/domain";
import type {
  DiscoveredPlace,
  NearbyParkingResponse,
  PlaceDiscoveryAdapter,
} from "@/types/place-discovery";
import { createParkingProvider } from "../services/parking-provider";
import { getLocation } from "./repository";

type ParkingDependencies = {
  adapter?: PlaceDiscoveryAdapter | null;
  sourceMode?: "live" | "fixture";
};

function stableNumericSeed(locationId: string): string {
  let value = 17;
  for (const character of locationId) {
    value = (value * 31 + character.charCodeAt(0)) % 1_000_000_000;
  }
  return String(value).padStart(9, "0");
}

function offsetPoint(origin: GeoPoint, northMeters: number, eastMeters: number): GeoPoint {
  const latitude = origin.latitude + northMeters / 111_320;
  const longitudeScale = Math.max(0.1, Math.cos(origin.latitude * Math.PI / 180));
  const longitude = origin.longitude + eastMeters / (111_320 * longitudeScale);
  return { latitude, longitude };
}

/** Synthetic, deterministic records used only while NEXT_PUBLIC_USE_MOCK_DATA=true. */
export function createParkingFixtureAdapter(
  locationId: string,
  origin: GeoPoint,
): PlaceDiscoveryAdapter {
  const seed = stableNumericSeed(locationId);
  const fixtures = [
    { suffix: "1", name: "개발용 제1 주차장", north: 180, east: 120, phone: "051-000-0001" },
    { suffix: "2", name: "개발용 제2 주차장", north: -520, east: 260, phone: null },
    { suffix: "3", name: "개발용 제3 주차장", north: 1_250, east: -520, phone: "051-000-0003" },
    { suffix: "4", name: "개발용 제4 주차장", north: -2_100, east: -700, phone: null },
    { suffix: "5", name: "개발용 제5 주차장", north: 3_500, east: 900, phone: "051-000-0005" },
  ].map(({ suffix, name, north, east, phone }): DiscoveredPlace => {
    const id = `${seed}${suffix}`;
    return {
      id,
      name,
      categoryName: "교통,수송 > 주차장",
      categoryGroupCode: "PK6",
      categoryGroupName: "주차장",
      phone,
      address: "합성 fixture 주소",
      roadAddress: null,
      point: offsetPoint(origin, north, east),
      placeUrl: `https://place.map.kakao.com/${id}`,
      distanceMeters: null,
      source: "Kakao Local",
    };
  });
  return createFakeKakaoLocalAdapter(fixtures);
}

function mapProviderError(error: unknown): never {
  if (!(error instanceof KakaoLocalError)) {
    throw dataAccessError("Nearby parking provider failed", error);
  }
  if (error.code === "QUOTA") {
    throw rateLimitedError("Kakao Local quota exceeded", 60);
  }
  if (error.code === "VALIDATION") {
    throw validationError("주변 주차장 조회 조건이 올바르지 않습니다.");
  }
  if (error.code === "CONFIGURATION") {
    throw configurationError("Kakao Local REST key is unavailable");
  }
  throw dataAccessError(`Kakao Local parking lookup failed: ${error.code}`, error);
}

export async function getNearbyParking(
  locationId: string,
  radiusMeters: number,
  signal?: AbortSignal,
  dependencies: ParkingDependencies = {},
): Promise<NearbyParkingResponse> {
  const location = await getLocation(locationId);
  if (!location) throw notFoundError(`Location ${locationId} not found`);

  const sourceMode = dependencies.sourceMode
    ?? (publicEnv.useMockData ? "fixture" : "live");
  const adapter = dependencies.adapter !== undefined
    ? dependencies.adapter
    : sourceMode === "fixture"
      ? createParkingFixtureAdapter(locationId, location.point)
      : getKakaoLocalAdapter();
  if (!adapter) {
    throw configurationError("KAKAO_LOCAL_REST_API_KEY is not configured");
  }

  try {
    const candidates = await createParkingProvider(adapter, sourceMode).nearby(
      location.point,
      { radiusMeters, excludedParking: location.parking, signal },
    );
    return { locationId, radiusMeters, candidates, sourceMode };
  } catch (error) {
    return mapProviderError(error);
  }
}
