import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createSupabaseAdminClient, readSupabaseAdminEnvironment } from "../../scripts/shared/supabase-admin-client.ts";
import { getIntegrationEnv } from "./integration-env.ts";

const env = getIntegrationEnv();
const EXPECTED_MODEL = "Xenova/clip-vit-base-patch32@main"; // matches src/lib/ai/embedding-service.ts's CLIP_MODEL_ID/CLIP_MODEL_REVISION

function vec(build: (index: number) => number): string {
  return `[${Array.from({ length: 512 }, (_, index) => build(index)).join(",")}]`;
}

const QUERY_VECTOR = vec((index) => (index === 0 ? 1 : 0));

// Moves the manual pgvector/pg16-container regression scenarios from this
// project's history (see docs/search-ranking.md) into automated tests
// against a real migrated Supabase instance.
describe.skipIf(!env)("match_location_images regressions (live Supabase)", () => {
  const adminClient = env ? createSupabaseAdminClient(readSupabaseAdminEnvironment(process.env)) : null!;
  const createdLocationIds: string[] = [];

  afterEach(async () => {
    while (createdLocationIds.length > 0) {
      const id = createdLocationIds.pop()!;
      await adminClient.from("locations").delete().eq("id", id);
    }
  });

  async function seedLocation(overrides: Partial<{ region: string; category: string }> = {}) {
    const id = randomUUID();
    const { error } = await adminClient.from("locations").insert({
      id, name: `테스트 ${id.slice(0, 8)}`, description: "", category: overrides.category ?? "urban",
      region: overrides.region ?? "서울", address: "주소", latitude: 37.5, longitude: 127.0,
    });
    if (error) throw error;
    createdLocationIds.push(id);
    return id;
  }

  async function seedImage(locationId: string, embedding: string, model = EXPECTED_MODEL) {
    const { error } = await adminClient.from("location_images").insert({
      location_id: locationId, image_url: `https://example.com/${randomUUID()}.jpg`, embedding, embedding_model: model,
    });
    if (error) throw error;
  }

  it("similar search rejects other-model vectors and excludes seen places before LIMIT", async () => {
    const sourceId = await seedLocation();
    const seenId = await seedLocation();
    const nextId = await seedLocation();
    const incompatibleId = await seedLocation();
    await seedImage(sourceId, QUERY_VECTOR);
    await seedImage(seenId, QUERY_VECTOR);
    await seedImage(nextId, QUERY_VECTOR);
    await seedImage(incompatibleId, QUERY_VECTOR, "incompatible@v2");
    const response = await adminClient.rpc("match_similar_locations_filtered", {
      source_location_id: sourceId, match_threshold: 1, match_count: 200,
      expected_embedding_model: EXPECTED_MODEL, excluded_location_ids: [seenId],
    });
    expect(response.error).toBeNull();
    const ids = response.data.map((row: { location_id: string }) => row.location_id);
    expect(ids).toContain(nextId);
    expect(ids).not.toContain(sourceId);
    expect(ids).not.toContain(seenId);
    expect(ids).not.toContain(incompatibleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filter_region: a location outside a dominant cluster's raw top-N is still returned when it matches the filter", async () => {
    const dominantId = await seedLocation({ region: "서울" });
    const eligibleId = await seedLocation({ region: "부산" });
    for (let i = 1; i <= 5; i += 1) {
      await seedImage(dominantId, vec((index) => (index === 0 ? 1 - 0.0001 * i : 0)));
    }
    await seedImage(eligibleId, vec((index) => (index === 0 ? 0.6 : index === 511 ? 0.8 : 0)));

    const unfiltered = await adminClient.rpc("match_location_images", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 3, expected_embedding_model: EXPECTED_MODEL,
    });
    expect(unfiltered.error).toBeNull();
    expect(unfiltered.data.every((row: { location_id: string }) => row.location_id === dominantId)).toBe(true);

    const filtered = await adminClient.rpc("match_location_images", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 3, filter_region: "부산", expected_embedding_model: EXPECTED_MODEL,
    });
    expect(filtered.error).toBeNull();
    expect(filtered.data).toHaveLength(1);
    expect(filtered.data[0].location_id).toBe(eligibleId);
  });

  // There used to be an exclude_location_id regression test here, covering
  // a now-removed match_location_images parameter -- similar-locations
  // search was switched to origin/main's match_similar_location_images RPC
  // (supabase/migrations/20260928000000_similar_locations.sql) during the
  // feat/backend-supabase merge, which does its own exclusion in SQL. That
  // RPC's self-exclusion is covered end-to-end by
  // src/domains/locations/server/supabase-repository.integration.test.ts's
  // "getSupabaseSimilarLocations: excludes the target location" case
  // instead -- not duplicated here.

  it("expected_embedding_model is an optional filter on match_location_images: a mismatched row is excluded only when a model is actually requested", async () => {
    // Scoped to this test's own seeded row via filter_category rather than
    // asserting a global "0 rows in the whole table" -- a shared live DB
    // (a developer's local Supabase, or another concurrently-running
    // integration test file) may have unrelated rows in location_images,
    // and this test should not depend on the table being otherwise empty.
    const uniqueCategory = "interior"; // combined with a fresh location, unique enough for match_count: 10 not to spill into unrelated rows
    const locationId = await seedLocation({ category: uniqueCategory });
    await seedImage(locationId, QUERY_VECTOR, "some-other-model@v2");

    const withCorrectModel = await adminClient.rpc("match_location_images", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 10, filter_category: uniqueCategory, expected_embedding_model: EXPECTED_MODEL,
    });
    expect(withCorrectModel.data.some((row: { location_id: string }) => row.location_id === locationId)).toBe(false);

    // Optional filter, not fail-closed: omitting expected_embedding_model
    // means "no model restriction", so the mismatched row is now included
    // (this project's application code never actually omits it -- see
    // docs/search-ranking.md -- but the RPC itself must behave this way).
    const withoutModel = await adminClient.rpc("match_location_images", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 10, filter_category: uniqueCategory,
    });
    expect(withoutModel.data.some((row: { location_id: string }) => row.location_id === locationId)).toBe(true);

    const withMatchingModel = await adminClient.rpc("match_location_images", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 10, filter_category: uniqueCategory, expected_embedding_model: "some-other-model@v2",
    });
    expect(withMatchingModel.data.some((row: { location_id: string }) => row.location_id === locationId)).toBe(true);
  });

  it("expected_embedding_model is an optional filter on match_location_images_filtered too, with the same null-means-unrestricted behavior", async () => {
    const uniqueCategory = "nature"; // distinct from the category used above, same reasoning
    const locationId = await seedLocation({ category: uniqueCategory });
    await seedImage(locationId, QUERY_VECTOR, "some-other-model@v2");

    const withCorrectModel = await adminClient.rpc("match_location_images_filtered", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 10, filter_category: uniqueCategory, expected_embedding_model: EXPECTED_MODEL,
    });
    expect(withCorrectModel.error).toBeNull();
    expect(withCorrectModel.data.some((row: { location_id: string }) => row.location_id === locationId)).toBe(false);

    const withoutModel = await adminClient.rpc("match_location_images_filtered", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 10, filter_category: uniqueCategory,
    });
    expect(withoutModel.error).toBeNull();
    expect(withoutModel.data.some((row: { location_id: string }) => row.location_id === locationId)).toBe(true);

    const withMatchingModel = await adminClient.rpc("match_location_images_filtered", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 10, filter_category: uniqueCategory, expected_embedding_model: "some-other-model@v2",
    });
    expect(withMatchingModel.error).toBeNull();
    expect(withMatchingModel.data.some((row: { location_id: string }) => row.location_id === locationId)).toBe(true);
  });

  it("match_location_images_filtered: a location outside a dominant cluster's raw top-N is still returned when it matches the filter, deduplicated to one image per place", async () => {
    const dominantId = await seedLocation({ region: "서울" });
    const eligibleId = await seedLocation({ region: "부산" });
    for (let i = 1; i <= 5; i += 1) {
      await seedImage(dominantId, vec((index) => (index === 0 ? 1 - 0.0001 * i : 0)));
    }
    await seedImage(eligibleId, vec((index) => (index === 0 ? 0.6 : index === 511 ? 0.8 : 0)));

    const filtered = await adminClient.rpc("match_location_images_filtered", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 3, filter_region: "부산", expected_embedding_model: EXPECTED_MODEL,
    });
    expect(filtered.error).toBeNull();
    expect(filtered.data).toHaveLength(1);
    expect(filtered.data[0].location_id).toBe(eligibleId);

    const unfiltered = await adminClient.rpc("match_location_images_filtered", {
      query_embedding: QUERY_VECTOR, match_threshold: 0, match_count: 3, expected_embedding_model: EXPECTED_MODEL,
    });
    expect(unfiltered.error).toBeNull();
    // Deduplicated to one row per location even though the dominant
    // location has 5 near-identical images -- not 5 separate rows.
    expect(unfiltered.data.filter((row: { location_id: string }) => row.location_id === dominantId)).toHaveLength(1);
  });
});
