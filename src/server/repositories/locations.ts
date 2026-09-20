import type { LocationFilter } from "@/types/domain";
import { getMockLocation, getMockLocations, getMockSimilarLocations, searchMockLocations } from "./mock-location-repository";
import { getSupabaseLocation, getSupabaseLocations, searchSupabaseLocations } from "./supabase-location-repository";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

export const getLocations = (filters: LocationFilter = {}) =>
  useMock ? Promise.resolve(getMockLocations(filters)) : getSupabaseLocations(filters);

export const getLocation = (id: string) =>
  useMock ? Promise.resolve(getMockLocation(id)) : getSupabaseLocation(id);

export const searchByImage = (embedding: number[], filters: LocationFilter = {}) =>
  useMock ? Promise.resolve(searchMockLocations(embedding, filters)) : searchSupabaseLocations(embedding, filters);

export const getSimilarLocations = (id: string) =>
  useMock ? Promise.resolve(getMockSimilarLocations(id)) : Promise.resolve([]);
