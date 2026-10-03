import type { LocationFilter, LocationListQuery, SearchQueryOptions } from "@/types/domain";
import { getMockLocation, getMockLocations, getMockSimilarLocations, searchMockLocations } from "./mock-repository";
import { getSupabaseLocation, getSupabaseLocations, getSupabaseSimilarLocations, searchSupabaseLocations } from "./supabase-repository";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

export const getLocations = (query: LocationListQuery = {}) =>
  useMock ? Promise.resolve(getMockLocations(query)) : getSupabaseLocations(query);

export const getLocation = (id: string) =>
  useMock ? Promise.resolve(getMockLocation(id)) : getSupabaseLocation(id);

export const searchByImage = (embedding: number[], filters: LocationFilter = {}, options: SearchQueryOptions = {}) =>
  useMock ? Promise.resolve(searchMockLocations(embedding, filters, options)) : searchSupabaseLocations(embedding, filters, options);

export const getSimilarLocations = (id: string) =>
  useMock ? Promise.resolve(getMockSimilarLocations(id)) : getSupabaseSimilarLocations(id);
