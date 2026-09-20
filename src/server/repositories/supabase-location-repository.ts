import "server-only";
import { getSupabaseClient } from "@/lib/supabase/server";
import type { Location, LocationFilter, LocationSearchResult, ParkingInfo } from "@/types/domain";
import { groupImageMatches, type ImageMatch } from "@/server/services/group-image-matches";

type Row = {
  id: string; name: string; description: string; category: Location["category"];
  region: Location["region"]; address: string; latitude: number; longitude: number;
  permit_type: string; contact_name: string | null; contact_phone: string | null;
  permit_note: string | null; noise_sources: Location["noiseSources"] | null;
  source_url: string | null;
  location_images: { id: string; image_url: string; alt: string | null }[];
  parking: { id: string; name: string; latitude: number; longitude: number; capacity: number | null; opening_hours: string | null; price_info: string | null; source: string | null }[];
};

function toLocation(row: Row): Location {
  return {
    id: row.id, name: row.name, description: row.description,
    category: row.category, region: row.region, address: row.address,
    point: { latitude: row.latitude, longitude: row.longitude },
    images: row.location_images.map((image) => ({ id: image.id, locationId: row.id, imageUrl: image.image_url, alt: image.alt ?? row.name })),
    permit: { type: row.permit_type, contactName: row.contact_name, contactPhone: row.contact_phone, note: row.permit_note },
    parking: row.parking.map((item): ParkingInfo => ({ id: item.id, locationId: row.id, name: item.name, point: { latitude: item.latitude, longitude: item.longitude }, capacity: item.capacity, openingHours: item.opening_hours, priceInfo: item.price_info, source: item.source })),
    noiseSources: row.noise_sources ?? [], sourceUrl: row.source_url,
  };
}

export async function getSupabaseLocations(filters: LocationFilter = {}): Promise<Location[]> {
  let query = getSupabaseClient().from("locations").select("*, location_images(id, image_url, alt), parking(id, name, latitude, longitude, capacity, opening_hours, price_info, source)").order("name");
  if (filters.region) query = query.eq("region", filters.region);
  if (filters.category) query = query.eq("category", filters.category);
  const { data, error } = await query;
  if (error) throw error;
  return (data as Row[]).map(toLocation);
}

export async function getSupabaseLocation(id: string): Promise<Location | null> {
  const { data, error } = await getSupabaseClient().from("locations")
    .select("*, location_images(id, image_url, alt), parking(id, name, latitude, longitude, capacity, opening_hours, price_info, source)")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toLocation(data as Row) : null;
}

export async function searchSupabaseLocations(embedding: number[], filters: LocationFilter = {}): Promise<LocationSearchResult[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("match_location_images", {
    query_embedding: embedding,
    match_threshold: 0,
    match_count: 200,
  });
  if (error) throw error;
  const matches: ImageMatch[] = (data ?? []).map((row: { location_image_id: string; location_id: string; similarity: number }) => ({
    locationImageId: row.location_image_id, locationId: row.location_id, similarity: row.similarity,
  }));
  const locations = await getSupabaseLocations(filters);
  return groupImageMatches(matches, locations, 8);
}
