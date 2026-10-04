import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockLocation, getMockLocations, getMockSimilarLocations, searchMockLocations } from "./mock-repository";

// supabase-repository.ts (and its dependency server-client.ts) start with
// `import "server-only"`, which would throw outside Next.js's bundler --
// see vitest.config.ts's "server-only" alias for why that's handled once,
// globally, instead of per file.
const getSupabaseClientMock = vi.fn();
vi.mock("@/infrastructure/supabase/server-client", () => ({
  getSupabaseClient: () => getSupabaseClientMock(),
}));

const loggerWarnMock = vi.fn();
vi.mock("@/shared/observability/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args), error: vi.fn(), info: vi.fn() },
}));

const { getSupabaseLocation, getSupabaseLocations, getSupabaseSimilarLocations, searchSupabaseLocations } = await import("./supabase-repository");

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

class QueryStub implements PromiseLike<QueryResult> {
  readonly calls: { method: string; args: unknown[] }[] = [];
  private callIndex = 0;
  constructor(private readonly results: QueryResult[]) {}
  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
  select(...args: unknown[]) { return this.record("select", args); }
  order(...args: unknown[]) { return this.record("order", args); }
  range(...args: unknown[]) { return this.record("range", args); }
  eq(...args: unknown[]) { return this.record("eq", args); }
  in(...args: unknown[]) { return this.record("in", args); }
  not(...args: unknown[]) { return this.record("not", args); }
  limit(...args: unknown[]) { return this.record("limit", args); }
  maybeSingle(...args: unknown[]) { return this.record("maybeSingle", args); }
  then<T1 = QueryResult, T2 = never>(
    onfulfilled?: ((value: QueryResult) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    // Each chain call (select/eq/in/...) returns `this` and is awaited only
    // once at the end, but a retry path (legacy-attribution fallback) builds
    // a brand new QueryStub per attempt via fakeClient's queue -- see below.
    const result = this.results[Math.min(this.callIndex, this.results.length - 1)];
    this.callIndex += 1;
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function fakeClient(options: { query?: QueryResult | QueryResult[]; rpc?: QueryResult | QueryResult[]; fromByTable?: Record<string, QueryResult | QueryResult[]> } = {}) {
  const toList = (value: QueryResult | QueryResult[] | undefined, fallback: QueryResult) =>
    value === undefined ? [fallback] : Array.isArray(value) ? value : [value];
  const queryStub = new QueryStub(toList(options.query, { data: [], error: null }));
  const rpcStub = new QueryStub(toList(options.rpc, { data: [], error: null }));
  const fromCalls: string[] = [];
  const tableStubs = new Map<string, QueryStub>();
  for (const [table, result] of Object.entries(options.fromByTable ?? {})) {
    tableStubs.set(table, new QueryStub(toList(result, { data: [], error: null })));
  }
  return {
    client: {
      from: (table: string) => {
        fromCalls.push(table);
        return tableStubs.get(table) ?? queryStub;
      },
      rpc: (...args: unknown[]) => { rpcStub.calls.push({ method: "rpc", args }); return rpcStub; },
    },
    queryStub,
    rpcStub,
    tableStubs,
    fromCalls,
  };
}

function locationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "loc-1", name: "테스트 장소", description: "설명", category: "urban", region: "서울",
    address: "주소", latitude: 37.5, longitude: 127.0, permit_type: "정보 확인 필요",
    contact_name: null, contact_phone: null, permit_note: null, noise_sources: null, source_url: null,
    location_images: [{ id: "img-1", image_url: "https://example.com/a.jpg", alt: null }],
    parking: [],
    ...overrides,
  };
}

// Same shape as locationRow() plus the attribution columns added by
// 20261001000000_location_attribution.sql (origin/main) -- used by the
// attribution-mapping and legacy-fallback tests below.
function attributedLocationRow(overrides: Record<string, unknown> = {}) {
  return locationRow({
    source: "Wikidata", source_url: "https://www.wikidata.org/wiki/Q1", author: null, license: null,
    license_url: null, last_verified_at: "2026-09-29T04:00:00Z",
    location_images: [{
      id: "img-1", image_url: "https://example.com/a.jpg", alt: null,
      source: "Wikimedia Commons", source_url: "https://commons.wikimedia.org/wiki/File:Test.jpg",
      author: "Example Author", license: "CC BY 4.0", license_url: "https://creativecommons.org/licenses/by/4.0",
      last_verified_at: "2026-09-29T04:00:00Z",
    }],
    ...overrides,
  });
}

const SCHEMA_MISSING_ATTRIBUTION_ERROR = { message: "column location_images.last_verified_at does not exist", code: "42703" };

beforeEach(() => {
  getSupabaseClientMock.mockReset();
  loggerWarnMock.mockReset();
});

describe("SupabaseLocationRepository / MockLocationRepository contract parity", () => {
  it("getLocations: both return a Location[] no larger than the default page size, missing → []", async () => {
    expect(getMockLocations()).toHaveLength(10);

    const { client, queryStub } = fakeClient({ query: { data: [locationRow()], error: null } });
    getSupabaseClientMock.mockReturnValue(client);
    const results = await getSupabaseLocations();
    expect(results).toHaveLength(1);
    expect(queryStub.calls.find((call) => call.method === "range")?.args).toEqual([0, 19]);
  });

  it("getLocations: region/category filters are applied via .eq(), matching LocationFilter semantics", async () => {
    expect(getMockLocations({ region: "부산" }).every((item) => item.region === "부산")).toBe(true);

    const { client, queryStub } = fakeClient({ query: { data: [], error: null } });
    getSupabaseClientMock.mockReturnValue(client);
    await getSupabaseLocations({ region: "부산", category: "urban" });
    const eqCalls = queryStub.calls.filter((call) => call.method === "eq").map((call) => call.args);
    expect(eqCalls).toEqual([["region", "부산"], ["category", "urban"]]);
  });

  it("getLocations: clamps an oversized limit to the server max (50) and a negative offset to 0", async () => {
    const { client, queryStub } = fakeClient({ query: { data: [], error: null } });
    getSupabaseClientMock.mockReturnValue(client);
    await getSupabaseLocations({ limit: 9999, offset: -5 });
    expect(queryStub.calls.find((call) => call.method === "range")?.args).toEqual([0, 49]);
  });

  it("getLocations: maps location and image attribution metadata when the attribution columns are present", async () => {
    const { client } = fakeClient({ query: { data: [attributedLocationRow()], error: null } });
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

  it("getLocations: retries with the legacy image relation when attribution columns are not migrated yet", async () => {
    const { client, queryStub } = fakeClient({
      query: [
        { data: null, error: SCHEMA_MISSING_ATTRIBUTION_ERROR },
        { data: [locationRow()], error: null },
      ],
    });
    getSupabaseClientMock.mockReturnValue(client);
    const results = await getSupabaseLocations();
    expect(results).toHaveLength(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Image attribution columns are unavailable; using the legacy location schema",
      expect.objectContaining({ code: "42703" }),
    );
    expect(queryStub.calls.filter((call) => call.method === "select")).toHaveLength(2);
  });

  it("getLocations: does not retry for an unrelated Supabase failure", async () => {
    const { client } = fakeClient({ query: { data: null, error: { message: "permission denied for table locations", code: "42501" } } });
    getSupabaseClientMock.mockReturnValue(client);
    await expect(getSupabaseLocations()).rejects.toMatchObject({ code: "DATA_UNAVAILABLE", status: 503 });
  });

  it("getLocation: both return null for a missing id", async () => {
    expect(getMockLocation("missing")).toBeNull();

    const { client } = fakeClient({ query: { data: null, error: null } });
    getSupabaseClientMock.mockReturnValue(client);
    expect(await getSupabaseLocation("missing")).toBeNull();
  });

  it("getLocation: a malformed image/parking sub-row is dropped, logged, and does not fail the request", async () => {
    const { client } = fakeClient({
      query: {
        data: locationRow({
          location_images: [{ id: "", image_url: "https://example.com/broken.jpg", alt: null }],
          parking: [{ id: "p1", name: "", latitude: 1, longitude: 1, capacity: null, opening_hours: null, price_info: null, source: null }],
        }),
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(client);
    const location = await getSupabaseLocation("loc-1");
    expect(location).not.toBeNull();
    expect(location!.images).toEqual([]);
    expect(location!.parking).toEqual([]);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock.mock.calls[0][1]).toMatchObject({ locationId: "loc-1" });
  });

  it("getLocation: retries with the legacy image relation when attribution columns are not migrated yet", async () => {
    const { client, queryStub } = fakeClient({
      query: [
        { data: null, error: SCHEMA_MISSING_ATTRIBUTION_ERROR },
        { data: locationRow(), error: null },
      ],
    });
    getSupabaseClientMock.mockReturnValue(client);
    const location = await getSupabaseLocation("loc-1");
    expect(location).toMatchObject({ id: "loc-1", images: [{ source: null, sourceUrl: null, author: null, license: null, licenseUrl: null, lastVerifiedAt: null }] });
    expect(queryStub.calls.filter((call) => call.method === "select")).toHaveLength(2);
  });

  it("getLocation: a Supabase error is surfaced as a thrown application error, not a silent null", async () => {
    const { client } = fakeClient({ query: { data: null, error: { message: "boom" } } });
    getSupabaseClientMock.mockReturnValue(client);
    await expect(getSupabaseLocation("loc-1")).rejects.toThrow();
  });

  it("search: both return at most 8 results for a full-length embedding", async () => {
    expect(searchMockLocations(Array(512).fill(0))).toHaveLength(8);

    const locationId = "22222222-2222-4222-8222-222222222222";
    const { client, queryStub, rpcStub } = fakeClient({
      query: { data: [locationRow({ id: locationId })], error: null },
      rpc: {
        data: [{ location_image_id: "11111111-1111-4111-8111-111111111111", location_id: locationId, similarity: 0.9 }],
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(client);
    const results = await searchSupabaseLocations(Array(512).fill(0));
    expect(results.length).toBeLessThanOrEqual(8);
    expect(results[0]?.location.id).toBe(locationId);
    const rpcCall = rpcStub.calls.find((call) => call.method === "rpc")?.args as [string, Record<string, unknown>];
    expect(rpcCall[1].expected_embedding_model).toBe("Xenova/clip-vit-base-patch32@main");
    // Metadata is loaded by the exact IDs the RPC returned, not by
    // re-applying a region/category filter -- there is no app-side
    // eligibility filter left to bypass.
    expect(queryStub.calls.find((call) => call.method === "in")?.args).toEqual(["id", [locationId]]);
    expect(queryStub.calls.some((call) => call.method === "eq")).toBe(false);
  });

  it("search: calls match_location_images_filtered (not the raw match_location_images) with region/category/threshold/model as SQL parameters", async () => {
    const { client, rpcStub } = fakeClient({ query: { data: [], error: null }, rpc: { data: [], error: null } });
    getSupabaseClientMock.mockReturnValue(client);
    await searchSupabaseLocations(Array(512).fill(0), { region: "부산", category: "nature" }, { threshold: 0.4 });
    const rpcCall = rpcStub.calls.find((call) => call.method === "rpc")?.args as [string, Record<string, unknown>];
    expect(rpcCall[0]).toBe("match_location_images_filtered");
    expect(rpcCall[1]).toEqual({
      query_embedding: Array(512).fill(0),
      filter_region: "부산",
      filter_category: "nature",
      match_threshold: 0.4,
      match_count: 8,
      expected_embedding_model: "Xenova/clip-vit-base-patch32@main",
    });
  });

  it("search: an omitted filter/threshold falls back to the documented server defaults", async () => {
    const { client, rpcStub } = fakeClient({ query: { data: [], error: null }, rpc: { data: [], error: null } });
    getSupabaseClientMock.mockReturnValue(client);
    await searchSupabaseLocations(Array(512).fill(0));
    const rpcCall = rpcStub.calls.find((call) => call.method === "rpc")?.args as [string, Record<string, unknown>];
    expect(rpcCall[1]).toMatchObject({ filter_region: null, filter_category: null, match_threshold: 0, match_count: 8 });
  });

  it("search: avoids loading any location metadata for an empty result", async () => {
    const { client, fromCalls } = fakeClient({ rpc: { data: [], error: null } });
    getSupabaseClientMock.mockReturnValue(client);
    await expect(searchSupabaseLocations(Array(512).fill(0))).resolves.toEqual([]);
    expect(fromCalls).toHaveLength(0);
  });

  it("search: an unexpected RPC response shape throws a clear error instead of crashing the ranker", async () => {
    const { client } = fakeClient({
      query: { data: [], error: null },
      rpc: { data: [{ location_id: "not-a-uuid" }], error: null },
    });
    getSupabaseClientMock.mockReturnValue(client);
    await expect(searchSupabaseLocations(Array(512).fill(0))).rejects.toThrow();
  });

  it("search: falls back to the legacy match_location_images RPC (with expected_embedding_model) only for an unfiltered query, when the filtered RPC's migration is missing", async () => {
    const { client, rpcStub } = fakeClient({
      query: { data: [], error: null },
      rpc: [
        { data: null, error: { code: "PGRST202", message: "Could not find the function public.match_location_images_filtered" } },
        { data: [], error: null },
      ],
    });
    getSupabaseClientMock.mockReturnValue(client);
    await expect(searchSupabaseLocations(Array(512).fill(0))).resolves.toEqual([]);
    const calls = rpcStub.calls.filter((call) => call.method === "rpc").map((call) => call.args);
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe("match_location_images_filtered");
    expect(calls[1]).toEqual(["match_location_images", {
      query_embedding: Array(512).fill(0), match_threshold: 0, match_count: 200,
      expected_embedding_model: "Xenova/clip-vit-base-patch32@main",
    }]);
  });

  it("search: does not silently fall back to the unfiltered legacy RPC when a region/category filter was requested", async () => {
    const { client, rpcStub } = fakeClient({
      rpc: { data: null, error: { code: "PGRST202", message: "Could not find the function public.match_location_images_filtered" } },
    });
    getSupabaseClientMock.mockReturnValue(client);
    await expect(searchSupabaseLocations(Array(512).fill(0), { region: "부산" })).rejects.toMatchObject({ code: "DATA_UNAVAILABLE", status: 503 });
    expect(rpcStub.calls.filter((call) => call.method === "rpc")).toHaveLength(1);
  });

  it("search/similar: getSupabaseLocationsByIds's row order does not affect the final result order -- similarity does", async () => {
    // Postgres/PostgREST does not guarantee row order for a plain .in() query.
    // Return locations metadata in the OPPOSITE order from the RPC's
    // similarity ranking to prove groupImageMatches (Member 1's ranker)
    // re-sorts by similarity itself rather than trusting this array's order.
    const lowId = "33333333-3333-4333-8333-333333333333";
    const highId = "44444444-4444-4444-8444-444444444444";
    const { client } = fakeClient({
      fromByTable: {
        locations: { data: [locationRow({ id: lowId, name: "낮은 유사도" }), locationRow({ id: highId, name: "높은 유사도" })], error: null },
      },
      rpc: {
        data: [
          { location_image_id: "11111111-1111-4111-8111-111111111111", location_id: lowId, similarity: 0.2 },
          { location_image_id: "22222222-2222-4222-8222-222222222222", location_id: highId, similarity: 0.9 },
        ],
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(client);
    const results = await searchSupabaseLocations(Array(512).fill(0));
    expect(results.map((result) => result.location.id)).toEqual([highId, lowId]);
    expect(results[0]?.similarity).toBeGreaterThan(results[1]!.similarity);
  });

  describe("similar locations", () => {
    it("rejects malformed RPC arrays through the structured data error", async () => {
      const { client } = fakeClient({ rpc: { data: { unexpected: true }, error: null } });
      getSupabaseClientMock.mockReturnValue(client);
      await expect(getSupabaseSimilarLocations("55555555-5555-4555-8555-555555555555")).rejects.toMatchObject({ code: "DATA_UNAVAILABLE" });
    });
    it("keeps filters when only model metadata migration is pending", async () => {
      const { client, rpcStub } = fakeClient({ rpc: [
        { data: null, error: { code: "PGRST202", message: "match_location_images_filtered(expected_embedding_model) missing" } },
        { data: [], error: null },
      ] });
      getSupabaseClientMock.mockReturnValue(client);
      await expect(searchSupabaseLocations(Array(512).fill(0), { region: "제주", category: "nature" })).resolves.toEqual([]);
      const calls = rpcStub.calls.filter((call) => call.method === "rpc");
      expect(calls).toHaveLength(2);
      expect(calls[1].args).toEqual(["match_location_images_filtered", { query_embedding: Array(512).fill(0), match_threshold: 0, match_count: 8, filter_region: "제주", filter_category: "nature" }]);
    });
    // getSupabaseSimilarLocations delegates embedding selection (the mean of
    // all of a location's image embeddings) and self-exclusion/grouping to
    // Member 1's match_similar_location_images RPC + rankSimilarLocations --
    // these tests check the repository's own wiring (RPC call shape,
    // metadata lookup, error mapping), not the ranking logic itself.
    it("calls match_similar_location_images with the documented default threshold/count, and never includes the source location", async () => {
      const targetId = "55555555-5555-4555-8555-555555555555";
      const otherId = "66666666-6666-4666-8666-666666666666";
      const { client, rpcStub, tableStubs } = fakeClient({
        fromByTable: {
          locations: { data: [locationRow({ id: otherId }), locationRow({ id: targetId })], error: null },
        },
        rpc: { data: [{ location_image_id: "11111111-1111-4111-8111-111111111111", location_id: otherId, similarity: 0.7 }], error: null },
      });
      getSupabaseClientMock.mockReturnValue(client);
      const results = await getSupabaseSimilarLocations(targetId);
      expect(results.every((result) => result.location.id !== targetId)).toBe(true);
      expect(results.map((result) => result.location.id)).toEqual([otherId]);
      const rpcCall = rpcStub.calls.find((call) => call.method === "rpc")?.args as [string, Record<string, unknown>];
      expect(rpcCall[0]).toBe("match_similar_locations_filtered");
      expect(rpcCall[1]).toEqual({ source_location_id: targetId, match_threshold: 0, match_count: 8, expected_embedding_model: "Xenova/clip-vit-base-patch32@main", excluded_location_ids: [] });
      // The metadata lookup is by the exact matched + source ids (via
      // getSupabaseLocationsByIds's .in()), never a plain/paginated
      // getSupabaseLocations() call -- see the comment in
      // supabase-repository.ts for why that distinction matters once
      // getSupabaseLocations() became paginated.
      const locationsStub = tableStubs.get("locations")!;
      expect(locationsStub.calls.some((call) => call.method === "range")).toBe(false);
      const inCall = locationsStub.calls.find((call) => call.method === "in")?.args as [string, string[]];
      expect(new Set(inCall[1])).toEqual(new Set([otherId, targetId]));
    });

    it("a nonexistent location still returns [] (no error) via the RPC's own exclusion + rankSimilarLocations' existence guard", async () => {
      const { client, rpcStub } = fakeClient({
        fromByTable: { locations: { data: [], error: null } },
        rpc: { data: [], error: null },
      });
      getSupabaseClientMock.mockReturnValue(client);
      const results = await getSupabaseSimilarLocations("missing");
      expect(results).toEqual([]);
      expect(rpcStub.calls).toHaveLength(1);
    });

    it("a location with no usable embedding (RPC returns no candidates) returns []", async () => {
      const targetId = "55555555-5555-4555-8555-555555555555";
      const { client } = fakeClient({
        fromByTable: { locations: { data: [locationRow({ id: targetId })], error: null } },
        rpc: { data: [], error: null },
      });
      getSupabaseClientMock.mockReturnValue(client);
      await expect(getSupabaseSimilarLocations(targetId)).resolves.toEqual([]);
    });

    it("mock: a location with no same-category peers returns []", () => {
      expect(getMockSimilarLocations("missing")).toEqual([]);
    });

    it("maps an RPC failure to the shared data-access error contract", async () => {
      const targetId = "55555555-5555-4555-8555-555555555555";
      const { client } = fakeClient({
        fromByTable: { locations: { data: [locationRow({ id: targetId })], error: null } },
        rpc: { data: null, error: { message: "RPC unavailable" } },
      });
      getSupabaseClientMock.mockReturnValue(client);
      await expect(getSupabaseSimilarLocations(targetId)).rejects.toMatchObject({ code: "DATA_UNAVAILABLE", status: 503 });
    });
  });
});
