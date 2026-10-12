import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredPlace } from "@/types/place-discovery";
import { createFakeKakaoLocalAdapter } from "./fake-local-adapter";
import { KakaoLocalClient, sanitizeKakaoPlaceUrl } from "./local-client";

function rawPlace(overrides: Record<string, unknown> = {}) {
  return {
    id: "123",
    place_name: "부산시민공원 주차장",
    category_name: "교통,수송 > 주차장",
    category_group_code: "PK6",
    category_group_name: "주차장",
    phone: "051-123-4567",
    address_name: "부산 부산진구 범전동",
    road_address_name: "부산 부산진구 시민공원로 73",
    x: "129.0570",
    y: "35.1667",
    place_url: "http://place.map.kakao.com/123",
    distance: "42",
    ...overrides,
  };
}

function response(documents = [rawPlace()], status = 200): Response {
  return new Response(JSON.stringify({
    meta: { total_count: documents.length, pageable_count: documents.length, is_end: true },
    documents,
  }), { status, headers: { "Content-Type": "application/json" } });
}

function client(fetcher = vi.fn<typeof fetch>()) {
  return {
    fetcher,
    client: new KakaoLocalClient({
      restApiKey: "fake-rest-key",
      fetcher,
      timeoutMilliseconds: 100,
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("KakaoLocalClient", () => {
  it.each(["", " ", "\t", "0x10", "Infinity", "NaN"])("rejects missing/non-decimal provider coordinates %j instead of inventing zero", async (coordinate) => {
    const setup = client();
    for (const field of ["x", "y"]) {
      setup.fetcher.mockResolvedValueOnce(response([rawPlace({ [field]: coordinate })]));
      await expect(setup.client.searchByKeyword({ query: "주차장" }))
        .rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    }
  });

  it("retains genuine zero and signed decimal coordinates", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(response([rawPlace({ x: "0", y: "-35.1667" })]));
    await expect(setup.client.searchByKeyword({ query: "주차장" }))
      .resolves.toMatchObject({ places: [{ point: { longitude: 0, latitude: -35.1667 } }] });
  });

  it("uses one fixed-host request path for keyword search and deduplicates place IDs", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(response([rawPlace(), rawPlace()]));

    const result = await setup.client.searchByKeyword({
      query: " 시민공원 주차장 ",
      categoryGroupCode: "PK6",
      center: { latitude: 35.1667, longitude: 129.057 },
      radiusMeters: 500,
      sort: "distance",
    });

    expect(result.places).toHaveLength(1);
    expect(result.places[0]).toMatchObject({
      id: "123",
      phone: "051-123-4567",
      placeUrl: "https://place.map.kakao.com/123",
      distanceMeters: 42,
    });
    const [url, init] = setup.fetcher.mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).origin).toBe("https://dapi.kakao.com");
    expect((url as URL).pathname).toBe("/v2/local/search/keyword.json");
    expect((url as URL).searchParams.get("query")).toBe("시민공원 주차장");
    expect((url as URL).searchParams.get("radius")).toBe("500");
    expect(init?.headers).toMatchObject({ Authorization: "KakaoAK fake-rest-key" });
    expect(init?.cache).toBe("no-store");
  });

  it("reuses the adapter request core for bounded category lookup", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(response());
    await setup.client.searchByCategory({
      categoryGroupCode: "PK6",
      center: { latitude: 35.1667, longitude: 129.057 },
      radiusMeters: 2_000,
      page: 2,
      size: 5,
    });
    const [url] = setup.fetcher.mock.calls[0];
    expect((url as URL).pathname).toBe("/v2/local/search/category.json");
    expect(Object.fromEntries((url as URL).searchParams)).toMatchObject({
      category_group_code: "PK6",
      x: "129.057",
      y: "35.1667",
      radius: "2000",
      page: "2",
      size: "5",
    });
  });

  it("never calls the provider without a separate REST key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const adapter = new KakaoLocalClient({ restApiKey: undefined, fetcher });
    await expect(adapter.searchByKeyword({ query: "주차장" }))
      .rejects.toMatchObject({ code: "CONFIGURATION" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { categoryGroupCode: "PK6", center: { latitude: 91, longitude: 129 }, radiusMeters: 500 },
    { categoryGroupCode: "PK6", center: { latitude: 35, longitude: 129 }, radiusMeters: 20_001 },
    { categoryGroupCode: "PK6", center: { latitude: 35, longitude: 129 }, radiusMeters: 500, page: 0 },
  ])("rejects invalid coordinate, radius, or page before fetch", async (request) => {
    const setup = client();
    await expect(setup.client.searchByCategory(request as never))
      .rejects.toMatchObject({ code: "VALIDATION" });
    expect(setup.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [403, "FORBIDDEN"],
    [429, "QUOTA"],
  ])("maps Kakao status %i to %s", async (status, code) => {
    const setup = client();
    setup.fetcher.mockResolvedValue(new Response("", { status }));
    await expect(setup.client.searchByKeyword({ query: "주차장" }))
      .rejects.toMatchObject({ code });
  });

  it("drops unsafe links and rejects malformed coordinates", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValueOnce(response([rawPlace({
      place_url: "https://evil.example/123",
    })]));
    await expect(setup.client.searchByKeyword({ query: "주차장" }))
      .resolves.toMatchObject({ places: [{ placeUrl: null }] });

    setup.fetcher.mockResolvedValueOnce(response([rawPlace({ y: "999" })]));
    await expect(setup.client.searchByKeyword({ query: "주차장" }))
      .rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("distinguishes caller cancellation from timeout", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }));
    const adapter = new KakaoLocalClient({
      restApiKey: "fake-rest-key",
      fetcher,
      timeoutMilliseconds: 100,
    });
    const timedOut = adapter.searchByKeyword({ query: "주차장" });
    const timeoutAssertion = expect(timedOut).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(100);
    await timeoutAssertion;

    const controller = new AbortController();
    const cancelled = adapter.searchByKeyword({ query: "주차장" }, { signal: controller.signal });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it.each(["TIMEOUT", "CANCELLED"] as const)("classifies response-body abort as %s, not malformed JSON", async (code) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Response(new ReadableStream({
      start(stream) {
        init?.signal?.addEventListener("abort", () => stream.error(new DOMException("Aborted", "AbortError")), { once: true });
      },
    })));
    const setup = client(fetcher);
    const pending = setup.client.searchByKeyword({ query: "주차장" }, { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code });
    if (code === "TIMEOUT") await vi.advanceTimersByTimeAsync(100);
    else {
      // Let headers arrive and begin reading the body before cancellation.
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
    }
    await assertion;
  });
});

describe("Kakao Local link and fake provider", () => {
  it("normalizes only the exact provider place link", () => {
    expect(sanitizeKakaoPlaceUrl("http://place.map.kakao.com/123", "123"))
      .toBe("https://place.map.kakao.com/123");
    expect(sanitizeKakaoPlaceUrl("https://place.map.kakao.com.evil.test/123", "123"))
      .toBeNull();
    expect(sanitizeKakaoPlaceUrl("javascript:alert(1)", "123")).toBeNull();
  });

  it("supports both keyword and category consumers without a key and removes seed duplicates", async () => {
    const seed: DiscoveredPlace = {
      id: "123",
      name: "부산시민공원 주차장",
      categoryName: "교통,수송 > 주차장",
      categoryGroupCode: "PK6",
      categoryGroupName: "주차장",
      phone: "051-123-4567",
      address: "부산 부산진구",
      roadAddress: null,
      point: { latitude: 35.1667, longitude: 129.057 },
      placeUrl: "https://place.map.kakao.com/123",
      distanceMeters: null,
      source: "Kakao Local",
    };
    const adapter = createFakeKakaoLocalAdapter([seed, { ...seed }]);
    await expect(adapter.searchByKeyword({ query: "시민공원" }))
      .resolves.toMatchObject({ places: [{ id: "123" }] });
    await expect(adapter.searchByCategory({
      categoryGroupCode: "PK6",
      center: seed.point,
      radiusMeters: 100,
      sort: "distance",
    })).resolves.toMatchObject({ places: [{ id: "123", distanceMeters: 0 }] });
  });
});
