import type { GeoPoint } from "@/types/domain";

export interface GeocodingAdapter {
  geocode(address: string): Promise<GeoPoint | null>;
}

export const mockGeocodingAdapter: GeocodingAdapter = {
  async geocode() { return null; },
};
