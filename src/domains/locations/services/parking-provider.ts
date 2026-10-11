import type { GeoPoint, ParkingInfo } from "@/types/domain";
import {
  MAX_NEARBY_PARKING_RESULTS,
  nearbyParkingCandidateSchema,
  type NearbyParkingCandidate,
  type PlaceDiscoveryAdapter,
} from "@/types/place-discovery";
import { getStraightLineDistanceMeters } from "./parking-distance";

export type ParkingProviderOptions = {
  radiusMeters: number;
  excludedParking?: readonly ParkingInfo[];
  signal?: AbortSignal;
};

export interface ParkingProvider {
  nearby(point: GeoPoint, options: ParkingProviderOptions): Promise<NearbyParkingCandidate[]>;
}

export const mockParkingProvider: ParkingProvider = {
  async nearby() { return []; },
};

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR").replace(/\s+/gu, "");
}

function isStaticDuplicate(
  candidate: NearbyParkingCandidate,
  staticParking: readonly ParkingInfo[],
): boolean {
  return staticParking.some((item) => {
    if (normalizeName(item.name) === normalizeName(candidate.name)) return true;
    const distance = getStraightLineDistanceMeters(item.point, candidate.point);
    return distance !== null && distance < 20;
  });
}

function safePhone(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[0-9()+\-\s]{1,40}$/u.test(trimmed) ? trimmed : null;
}

/** Adapts bounded Kakao PK6 search results without persisting provider data. */
export function createParkingProvider(
  adapter: PlaceDiscoveryAdapter,
  sourceMode: "live" | "fixture" = "live",
): ParkingProvider {
  return {
    async nearby(point, options) {
      const page = await adapter.searchByCategory({
        categoryGroupCode: "PK6",
        center: point,
        radiusMeters: options.radiusMeters,
        page: 1,
        size: 15,
        sort: "distance",
      }, { signal: options.signal });

      const prefix = sourceMode === "live" ? "kakao-local" : "fixture";
      const source = sourceMode === "live"
        ? "Kakao Local"
        : "SceneScan synthetic fixture";
      const unique = new Map<string, NearbyParkingCandidate>();

      for (const place of page.places) {
        if (unique.has(place.id)) continue;
        const distance = getStraightLineDistanceMeters(point, place.point);
        if (distance === null || distance > options.radiusMeters) continue;
        const candidate = nearbyParkingCandidateSchema.parse({
          id: `${prefix}:${place.id}`,
          providerPlaceId: place.id,
          relationship: "nearby",
          name: place.name,
          address: place.roadAddress ?? place.address,
          phone: safePhone(place.phone),
          placeUrl: place.placeUrl,
          point: place.point,
          distanceMeters: Math.round(distance),
          capacity: null,
          openingHours: null,
          priceInfo: null,
          source,
        });
        if (!isStaticDuplicate(candidate, options.excludedParking ?? [])) {
          unique.set(place.id, candidate);
        }
      }

      return [...unique.values()]
        .sort((left, right) => left.distanceMeters - right.distanceMeters
          || left.id.localeCompare(right.id))
        .slice(0, MAX_NEARBY_PARKING_RESULTS);
    },
  };
}
