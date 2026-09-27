import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseClientMock } = vi.hoisted(() => ({ getSupabaseClientMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/supabase/server-client", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

import { getSupabaseSimilarLocations } from "./supabase-repository";

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
  source_url: null,
  location_images: [{ id: `${id}-image`, image_url: "/test.svg", alt: null }],
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
