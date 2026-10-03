import type { LOCATION_CATEGORY_VALUES, REGION_VALUES } from "./location-options";

export type LocationCategory = (typeof LOCATION_CATEGORY_VALUES)[number];
export type Region = (typeof REGION_VALUES)[number];

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface PermitInfo {
  type: string;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
  source: string | null;
  sourceUrl: string | null;
  referenceDate: string | null;
  lastVerifiedAt: string | null;
}

export interface ParkingInfo {
  id: string;
  locationId: string | null;
  name: string;
  point: GeoPoint;
  capacity: number | null;
  openingHours: string | null;
  priceInfo: string | null;
  source: string | null;
}

export interface ParkingDistanceResult {
  parking: ParkingInfo;
  distanceMeters: number | null;
}

export interface NoiseSource {
  kind: string;
  note: string;
}

export interface SourceMetadata {
  source: string | null;
  sourceUrl: string | null;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  lastVerifiedAt: string | null;
}

export interface LocationImage extends SourceMetadata {
  id: string;
  locationId: string;
  imageUrl: string;
  alt: string;
}

export interface Location extends SourceMetadata {
  id: string;
  name: string;
  description: string;
  category: LocationCategory;
  region: Region;
  address: string;
  point: GeoPoint;
  images: LocationImage[];
  permit: PermitInfo;
  parking: ParkingInfo[];
  noiseSources: NoiseSource[];
}

export type LocationDetail = Location;
export interface LocationFilter {
  region?: Region;
  category?: LocationCategory;
}

// Listing-only: pagination has no meaning for search (always top 8) or
// getSimilarLocations, so it is kept out of LocationFilter itself and only
// added here. See LOCATION_LIST_DEFAULT_LIMIT / LOCATION_LIST_MAX_LIMIT in
// src/types/contracts.ts for the default/cap this is validated and clamped
// against.
export interface LocationListQuery extends LocationFilter {
  limit?: number;
  offset?: number;
}

export interface LocationSearchResult {
  location: Location;
  similarity: number;
  matchedImageId: string;
}

// Tuning knobs for the pre-aggregation candidate retrieval step only (maps
// to the match_location_images RPC's match_threshold/match_count). The
// post-aggregation result count is a fixed product policy (always up to 8
// locations, see docs/search-ranking.md) and is not client-configurable --
// do not confuse `count` here with "how many locations to return".
//
// `count` is internal-only: POST /api/search's public request schema
// (searchRequestSchema, src/types/contracts.ts) does not accept it: there
// is no product need for a client to widen/narrow the server's candidate
// window, and match_count is always SEARCH_MATCH_COUNT_DEFAULT. It remains
// here only because repository call sites pass it as a fixed internal
// constant, not a caller-supplied value.
export interface SearchQueryOptions {
  threshold?: number;
  count?: number;
}

export interface SolarPosition {
  azimuthDegrees: number;
  altitudeDegrees: number;
  isAboveHorizon: boolean;
}

export type LightingClassification =
  | "front-light"
  | "side-light"
  | "back-light";
