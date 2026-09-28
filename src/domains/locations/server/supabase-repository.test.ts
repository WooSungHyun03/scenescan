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

type QueryResult = { data: unknown; error: { message: string } | null };

class QueryStub implements PromiseLike<QueryResult> {
  readonly calls: { method: string; args: unknown[] }[] = [];
  constructor(private readonly result: QueryResult) {}
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
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function fakeClient(options: { query?: QueryResult; rpc?: QueryResult; fromByTable?: Record<string, QueryResult> } = {}) {
  const queryStub = new QueryStub(options.query ?? { data: [], error: null });
  const rpcStub = new QueryStub(options.rpc ?? { data: [], error: null });
  const fromCalls: string[] = [];
  const tableStubs = new Map<string, QueryStub>();
  for (const [table, result] of Object.entries(options.fromByTable ?? {})) tableStubs.set(table, new QueryStub(result));
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
        data: [{ image_id: "11111111-1111-4111-8111-111111111111", location_id: locationId, image_url: "https://example.com/a.jpg", similarity: 0.9 }],
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

  it("search: region/category filters and threshold/count reach the RPC as SQL parameters, not applied afterward in JS", async () => {
    const { client, rpcStub } = fakeClient({ query: { data: [], error: null }, rpc: { data: [], error: null } });
    getSupabaseClientMock.mockReturnValue(client);
    await searchSupabaseLocations(Array(512).fill(0), { region: "부산", category: "nature" }, { threshold: 0.4, count: 60 });
    const rpcCall = rpcStub.calls.find((call) => call.method === "rpc")?.args as [string, Record<string, unknown>];
    expect(rpcCall[1]).toMatchObject({
      filter_region: "부산",
      filter_category: "nature",
      match_threshold: 0.4,
      match_count: 60,
    });
  });

  it("search: an omitted filter/threshold/count falls back to the documented server defaults", async () => {
    const { client, rpcStub } = fakeClient({ query: { data: [], error: null }, rpc: { data: [], error: null } });
    getSupabaseClientMock.mockReturnValue(client);
    await searchSupabaseLocations(Array(512).fill(0));
    const rpcCall = rpcStub.calls.find((call) => call.method === "rpc")?.args as [string, Record<string, unknown>];
    expect(rpcCall[1]).toMatchObject({ filter_region: null, filter_category: null, match_threshold: 0, match_count: 200 });
  });

  it("search: an unexpected RPC response shape throws a clear error instead of crashing the ranker", async () => {
    const { client } = fakeClient({
      query: { data: [], error: null },
      rpc: { data: [{ location_id: "not-a-uuid" }], error: null },
    });
    getSupabaseClientMock.mockReturnValue(client);
    await expect(searchSupabaseLocations(Array(512).fill(0))).rejects.toThrow();
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
          { image_id: "11111111-1111-4111-8111-111111111111", location_id: lowId, image_url: "https://example.com/low.jpg", similarity: 0.2 },
          { image_id: "22222222-2222-4222-8222-222222222222", location_id: highId, image_url: "https://example.com/high.jpg", similarity: 0.9 },
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
    it("both never include the location itself", async () => {
      const similarMock = getMockSimilarLocations("00000000-0000-4000-8000-000000000001");
      expect(similarMock.some((result) => result.location.id === "00000000-0000-4000-8000-000000000001")).toBe(false);

      const targetId = "55555555-5555-4555-8555-555555555555";
      const otherId = "66666666-6666-4666-8666-666666666666";
      const { client, rpcStub } = fakeClient({
        fromByTable: {
          location_images: { data: { embedding: "[1,0,0,0]" }, error: null },
          locations: { data: [locationRow({ id: otherId })], error: null },
        },
        rpc: { data: [{ image_id: "77777777-7777-4777-8777-777777777777", location_id: otherId, image_url: "https://example.com/x.jpg", similarity: 0.7 }], error: null },
      });
      getSupabaseClientMock.mockReturnValue(client);
      const results = await getSupabaseSimilarLocations(targetId);
      expect(results.every((result) => result.location.id !== targetId)).toBe(true);
      const rpcCall = rpcStub.calls.find((call) => call.method === "rpc")?.args as [string, Record<string, unknown>];
      expect(rpcCall[1].exclude_location_id).toBe(targetId);
      expect(rpcCall[1].query_embedding).toBe("[1,0,0,0]");
    });

    it("fetches the representative embedding filtered by location_id, expected embedding_model, and non-null, ordered deterministically", async () => {
      const targetId = "55555555-5555-4555-8555-555555555555";
      const { client, tableStubs } = fakeClient({
        fromByTable: { location_images: { data: null, error: null } },
      });
      getSupabaseClientMock.mockReturnValue(client);
      await getSupabaseSimilarLocations(targetId);
      const imagesStub = tableStubs.get("location_images")!;
      const eqCalls = imagesStub.calls.filter((call) => call.method === "eq").map((call) => call.args);
      expect(eqCalls).toEqual([["location_id", targetId], ["embedding_model", "Xenova/clip-vit-base-patch32@main"]]);
      expect(imagesStub.calls.some((call) => call.method === "not" && call.args[0] === "embedding")).toBe(true);
      expect(imagesStub.calls.filter((call) => call.method === "order").map((call) => call.args[0])).toEqual(["created_at", "id"]);
    });

    it("real: no representative embedding -> [] without calling the RPC", async () => {
      const { client, rpcStub } = fakeClient({ fromByTable: { location_images: { data: null, error: null } } });
      getSupabaseClientMock.mockReturnValue(client);
      const results = await getSupabaseSimilarLocations("55555555-5555-4555-8555-555555555555");
      expect(results).toEqual([]);
      expect(rpcStub.calls).toHaveLength(0);
    });

    it("mock: a location with no same-category peers returns []", () => {
      expect(getMockSimilarLocations("missing")).toEqual([]);
    });

    it("self-domination regression: excluding the target location returns other locations even when the target's own images would otherwise fill every slot", async () => {
      const targetId = "55555555-5555-4555-8555-555555555555";
      const otherId = "66666666-6666-4666-8666-666666666666";
      const { client, rpcStub } = fakeClient({
        fromByTable: {
          location_images: { data: { embedding: "[1,0,0,0]" }, error: null },
          locations: { data: [locationRow({ id: otherId })], error: null },
        },
        // The RPC itself is responsible for excluding the target's own
        // images (verified against real Postgres in docs/search-ranking.md);
        // this test only asserts the repository passes exclude_location_id
        // through and correctly maps whatever the RPC returns.
        rpc: { data: [{ image_id: "77777777-7777-4777-8777-777777777777", location_id: otherId, image_url: "https://example.com/x.jpg", similarity: 0.6 }], error: null },
      });
      getSupabaseClientMock.mockReturnValue(client);
      const results = await getSupabaseSimilarLocations(targetId);
      expect(results).toHaveLength(1);
      expect(results[0]?.location.id).toBe(otherId);
      const rpcCall = rpcStub.calls.find((call) => call.method === "rpc")?.args as [string, Record<string, unknown>];
      expect(rpcCall[1].exclude_location_id).toBe(targetId);
    });
  });
});
