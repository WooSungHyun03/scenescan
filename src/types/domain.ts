export type LocationCategory = "urban" | "nature" | "industrial" | "interior";
export type Region = "서울" | "부산" | "인천" | "경기";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface PermitInfo {
  type: string;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
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

export interface NoiseSource {
  kind: string;
  note: string;
}

export interface LocationImage {
  id: string;
  locationId: string;
  imageUrl: string;
  alt: string;
}

export interface Location {
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
  sourceUrl: string | null;
}

export type LocationDetail = Location;
export interface LocationFilter {
  region?: Region;
  category?: LocationCategory;
}

export interface LocationSearchResult {
  location: Location;
  similarity: number;
  matchedImageId: string;
}

export interface SolarPosition {
  azimuthDegrees: number;
  altitudeDegrees: number;
  isAboveHorizon: boolean;
}
