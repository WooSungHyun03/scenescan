import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseClientMock } = vi.hoisted(() => ({ getSupabaseClientMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/supabase/server-client", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

import { getSupabaseLocation, getSupabaseLocations, getSupabaseSimilarLocations } from "./supabase-repository";

const row = (id: string, name: string) => ({
  id,
  name,
  description: "",
  category: "urban",
  region: "서울",
  address: "test",
  latitude: 37.5,
  longitude: 127,
  permit_type: "확인 필요",
  contact_name: null,
  contact_phone: null,
  permit_note: null,
  noise_sources: [],
  source: "Wikidata",
  source_url: "https://www.wikidata.org/wiki/Q1",
  author: null,
  license: null,
  license_url: null,
  last_verified_at: "2026-09-29T04:00:00Z",
  location_images: [{
    id: `${id}-image`,
    image_url: "/test.svg",
    alt: null,
    source: "Wikimedia Commons",
    source_url: "https://commons.wikimedia.org/wiki/File:Test.jpg",
    author: "Example Author",
    license: "CC BY 4.0",
    license_url: "https://creativecommons.org/licenses/by/4.0",
    last_verified_at: "2026-09-29T04:00:00Z",
  }],
  parking: [],
});

function clientWith(locations: ReturnType<typeof row>[], matches: unknown[] = [], rpcError: unknown = null) {
  const order = vi.fn(async () => ({ data: locations, error: null }));
  const select = vi.fn(() => ({ order }));
  const rpc = vi.fn(async () => ({ data: matches, error: rpcError }));
  return { client: { from: vi.fn(() => ({ select })), rpc }, rpc };
}

describe("Supabase similar location repository", () => {
  beforeEach(() => getSupabaseClientMock.mockReset());

  it("maps location and image attribution metadata", async () => {
    const { client } = clientWith([row("source", "Source")]);
    getSupabaseClientMock.mockReturnValue(client);

    const [location] = await getSupabaseLocations();

    expect(location).toMatchObject({
      source: "Wikidata",
      sourceUrl: "https://www.wikidata.org/wiki/Q1",
      lastVerifiedAt: "2026-09-29T04:00:00Z",
      images: [{
        source: "Wikimedia Commons",
        author: "Example Author",
        license: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0",
      }],
    });
  });

  it("retries with the legacy image relation when attribution columns are not migrated yet", async () => {
    const legacyRow = row("legacy", "Legacy");
    const legacyImage = {
      id: legacyRow.location_images[0].id,
      image_url: legacyRow.location_images[0].image_url,
      alt: legacyRow.location_images[0].alt,
    };
    const select = vi.fn((relations: string) => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => relations.includes("last_verified_at")
          ? {
              data: null,
              error: {
                code: "42703",
                message: "column location_images.last_verified_at does not exist",
              },
            }
          : { data: { ...legacyRow, location_images: [legacyImage] }, error: null }),
      })),
    }));
    getSupabaseClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(getSupabaseLocation("legacy")).resolves.toMatchObject({
      id: "legacy",
      images: [{
        source: null,
        sourceUrl: null,
        author: null,
        license: null,
        licenseUrl: null,
        lastVerifiedAt: null,
      }],
    });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("does not hide unrelated Supabase failures behind the legacy fallback", async () => {
    const order = vi.fn(async () => ({
      data: null,
      error: { code: "42501", message: "permission denied for table locations" },
    }));
    const select = vi.fn(() => ({ order }));
    getSupabaseClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(getSupabaseLocations()).rejects.toMatchObject({
      code: "DATA_ACCESS_ERROR",
      status: 503,
    });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("calls the representative-embedding RPC and excludes the selected location", async () => {
    const { client, rpc } = clientWith(
      [row("source", "Source"), row("candidate-a", "A"), row("candidate-b", "B")],
      [
        { location_image_id: "source-image", location_id: "source", similarity: 1 },
        { location_image_id: "b-image", location_id: "candidate-b", similarity: 0.7 },
        { location_image_id: "a-image", location_id: "candidate-a", similarity: 0.9 },
      ],
    );
    getSupabaseClientMock.mockReturnValue(client);

    const results = await getSupabaseSimilarLocations("source");

    expect(rpc).toHaveBeenCalledWith("match_similar_location_images", {
      source_location_id: "source",
      match_threshold: 0,
      match_count: 200,
    });
    expect(results.map((result) => result.location.id)).toEqual(["candidate-a", "candidate-b"]);
  });

  it("returns empty results for an unknown location or a source without embeddings", async () => {
    const unknown = clientWith([row("candidate", "Candidate")]);
    getSupabaseClientMock.mockReturnValue(unknown.client);
    await expect(getSupabaseSimilarLocations("missing")).resolves.toEqual([]);
    expect(unknown.rpc).not.toHaveBeenCalled();

    const noEmbedding = clientWith([row("source", "Source")]);
    getSupabaseClientMock.mockReturnValue(noEmbedding.client);
    await expect(getSupabaseSimilarLocations("source")).resolves.toEqual([]);
  });

  it("maps RPC failures to the shared data-access error contract", async () => {
    const { client } = clientWith([row("source", "Source")], [], new Error("RPC unavailable"));
    getSupabaseClientMock.mockReturnValue(client);
    await expect(getSupabaseSimilarLocations("source")).rejects.toMatchObject({
      code: "DATA_ACCESS_ERROR",
      status: 503,
      publicMessage: "Search unavailable",
    });
  });
});
