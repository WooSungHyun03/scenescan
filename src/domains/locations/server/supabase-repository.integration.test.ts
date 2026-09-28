import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient, readSupabaseAdminEnvironment } from "../../../../scripts/shared/supabase-admin-client.ts";
import { getIntegrationEnv } from "../../../../supabase/tests/integration-env.ts";
import { getMockLocation, getMockLocations, searchMockLocations } from "./mock-repository";
import {
  getSupabaseLocation,
  getSupabaseLocations,
  getSupabaseSimilarLocations,
  searchSupabaseLocations,
} from "./supabase-repository";

const env = getIntegrationEnv();
const EXPECTED_MODEL = "Xenova/clip-vit-base-patch32@main";

function vec(build: (index: number) => number): string {
  return `[${Array.from({ length: 512 }, (_, index) => build(index)).join(",")}]`;
}

// Exercises the real repository layer (the code src/domains/locations/
// server/repository.ts calls in real mode) against a live migrated
// Supabase instance, and spot-checks that it returns the same *shape* as
// the mock repository for the same operations -- catching a "works in mock,
// breaks against real Supabase" divergence before it reaches production.
describe.skipIf(!env)("Supabase repository (live Supabase)", () => {
  const adminClient = env ? createSupabaseAdminClient(readSupabaseAdminEnvironment(process.env)) : null!;
  const createdLocationIds: string[] = [];

  afterAll(async () => {
    for (const id of createdLocationIds) await adminClient.from("locations").delete().eq("id", id);
  });

  async function seedLocation(overrides: { region?: string; category?: string; name?: string } = {}) {
    const id = randomUUID();
    const { error } = await adminClient.from("locations").insert({
      id, name: overrides.name ?? `장소 ${id.slice(0, 8)}`, description: "설명", category: overrides.category ?? "urban",
      region: overrides.region ?? "서울", address: "주소", latitude: 37.5, longitude: 127.0, source: "manual",
    });
    if (error) throw error;
    createdLocationIds.push(id);
    return id;
  }

  async function seedImage(locationId: string, embedding: string) {
    const { data, error } = await adminClient.from("location_images")
      .insert({ location_id: locationId, image_url: `https://example.com/${randomUUID()}.jpg`, embedding, embedding_model: EXPECTED_MODEL })
      .select("id").single();
    if (error) throw error;
    return data.id as string;
  }

  async function seedParking(locationId: string, name: string) {
    const { error } = await adminClient.from("parking").insert({ location_id: locationId, name, latitude: 37.5, longitude: 127.0, source: "manual" });
    if (error) throw error;
  }

  it("getSupabaseLocations / getSupabaseLocation: same output shape as the mock repository", async () => {
    const locationId = await seedLocation({ region: "부산", name: "리스트 테스트 장소" });
    await seedParking(locationId, "테스트 주차장");

    const list = await getSupabaseLocations({ region: "부산" });
    expect(list.some((location) => location.id === locationId)).toBe(true);
    const mockList = getMockLocations({ region: "부산" });
    // Same top-level keys on both real and mock Location objects -- a
    // mapper bug that silently dropped or renamed a field would show up
    // here even though both "work" individually.
    expect(Object.keys(list[0]).sort()).toEqual(Object.keys(mockList[0]).sort());

    const detail = await getSupabaseLocation(locationId);
    expect(detail?.id).toBe(locationId);
    expect(detail?.parking).toHaveLength(1);
    const mockDetail = getMockLocation(mockList[0].id);
    expect(Object.keys(detail!).sort()).toEqual(Object.keys(mockDetail!).sort());
  });

  it("getSupabaseLocation: returns null for a missing id, same as the mock repository", async () => {
    expect(await getSupabaseLocation(randomUUID())).toBeNull();
    expect(getMockLocation("missing")).toBeNull();
  });

  it("searchSupabaseLocations: real RPC search returns the same result shape as mock search", async () => {
    const locationId = await seedLocation({ name: "검색 테스트 장소" });
    await seedImage(locationId, vec((index) => (index === 0 ? 1 : 0)));

    const results = await searchSupabaseLocations(Array.from({ length: 512 }, (_, index) => (index === 0 ? 1 : 0)));
    expect(results.some((result) => result.location.id === locationId)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(8);

    const mockResults = searchMockLocations(Array(512).fill(0));
    expect(Object.keys(results[0]).sort()).toEqual(Object.keys(mockResults[0]).sort());
    expect(Object.keys(results[0].location).sort()).toEqual(Object.keys(mockResults[0].location).sort());
  });

  it("getSupabaseSimilarLocations: excludes the target location and returns [] for a location with no embedding", async () => {
    const targetId = await seedLocation({ name: "유사 장소 기준" });
    const otherId = await seedLocation({ name: "유사 장소 후보" });
    await seedImage(targetId, vec((index) => (index === 0 ? 1 : 0)));
    await seedImage(otherId, vec((index) => (index === 0 ? 0.9 : 0)));

    const similar = await getSupabaseSimilarLocations(targetId);
    expect(similar.every((result) => result.location.id !== targetId)).toBe(true);
    expect(similar.some((result) => result.location.id === otherId)).toBe(true);

    const noEmbeddingId = await seedLocation({ name: "임베딩 없는 장소" });
    expect(await getSupabaseSimilarLocations(noEmbeddingId)).toEqual([]);
  });
});
