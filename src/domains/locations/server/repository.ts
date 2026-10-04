import type { LocationFilter, LocationListQuery, SearchQueryOptions } from "@/types/domain";
import { publicEnv } from "@/env/public";
import { getMockLocation, getMockLocations, getMockSimilarLocations, searchMockLocations } from "./mock-repository";
import { getSupabaseLocation, getSupabaseLocations, getSupabaseLocationsByIds, getSupabaseSimilarLocations, searchSupabaseLocations } from "./supabase-repository";

const useMock = publicEnv.useMockData;

export const getLocations = (query: LocationListQuery = {}) =>
  useMock ? Promise.resolve(getMockLocations(query)) : getSupabaseLocations(query);

export const getLocation = (id: string) =>
  useMock ? Promise.resolve(getMockLocation(id)) : getSupabaseLocation(id);

export const getLocationsByIds = (ids: readonly string[]) =>
  useMock
    ? Promise.resolve(ids.flatMap((id) => { const location = getMockLocation(id); return location ? [location] : []; }))
    : getSupabaseLocationsByIds(ids);

export const searchByImage = (embedding: number[], filters: LocationFilter = {}, options: SearchQueryOptions = {}) =>
  useMock ? Promise.resolve(searchMockLocations(embedding, filters, options)) : searchSupabaseLocations(embedding, filters, options);

export const getSimilarLocations = (id: string, excludedIds: readonly string[] = []) =>
  useMock ? Promise.resolve(getMockSimilarLocations(id, excludedIds)) : getSupabaseSimilarLocations(id, excludedIds);
