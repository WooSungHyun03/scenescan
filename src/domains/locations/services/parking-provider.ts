import type { GeoPoint, ParkingInfo } from "@/types/domain";

export interface ParkingProvider {
  nearby(point: GeoPoint): Promise<ParkingInfo[]>;
}

export const mockParkingProvider: ParkingProvider = {
  async nearby() { return []; },
};
