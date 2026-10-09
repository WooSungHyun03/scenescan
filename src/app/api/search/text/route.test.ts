import { beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as src/app/api/search/route.test.ts: mock the whole
// repository module so its "server-only" import is never evaluated.
const searchByTextMock = vi.fn();
vi.mock("@/domains/locations/server/repository", () => ({
  searchByText: (...args: unknown[]) => searchByTextMock(...args),
}));

const { POST } = await import("./route");

function request(body: unknown, init: { headers?: Record<string, string>; rawBody?: string } = {}) {
  const payload = init.rawBody ?? JSON.stringify(body);
  return new Request("http://localhost/api/search/text", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init.headers },
    body: payload,
  });
}

function fakeResult(id = "loc-1") {
  return {
    location: {
      id, name: "테스트", description: "", category: "urban" as const, region: "부산" as const,
      district: null, aliases: [], tags: [], address: "",
      point: { latitude: 0, longitude: 0 }, permit: { type: "", contactName: null, contactPhone: null, note: null },
      images: [], parking: [], source: null, sourceUrl: null, author: null, license: null, licenseUrl: null, lastVerifiedAt: null,
    },
    score: 1,
    matchedOn: [{ field: "name" as const, keyword: "테스트" }],
  };
}

beforeEach(() => {
  searchByTextMock.mockReset();
});

describe("POST /api/search/text", () => {
  it("400s an empty query", async () => {
    const response = await POST(request({ query: "" }));
    expect(response.status).toBe(400);
    expect(searchByTextMock).not.toHaveBeenCalled();
  });

  it("400s a whitespace-only query", async () => {
    const response = await POST(request({ query: "   " }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("400s a query over 200 characters", async () => {
    const response = await POST(request({ query: "해".repeat(201) }));
    expect(response.status).toBe(400);
    expect(searchByTextMock).not.toHaveBeenCalled();
  });

  it("accepts a query at exactly 200 characters", async () => {
    searchByTextMock.mockResolvedValue([]);
    const response = await POST(request({ query: "해".repeat(200) }));
    expect(response.status).toBe(200);
  });

  it("400s invalid JSON", async () => {
    const response = await POST(request(undefined, { rawBody: "{not json" }));
    expect(response.status).toBe(400);
  });

  it("400s a body over the size cap without calling the repository", async () => {
    const response = await POST(request(undefined, { rawBody: JSON.stringify({ query: "해운대", padding: "x".repeat(4000) }) }));
    expect(response.status).toBe(400);
    expect(searchByTextMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized body using Content-Length before reading it", async () => {
    const response = await POST(request(undefined, { rawBody: JSON.stringify({ query: "해운대" }), headers: { "content-length": String(64 * 1024) } }));
    expect(response.status).toBe(400);
    expect(searchByTextMock).not.toHaveBeenCalled();
  });

  it("400s an unknown top-level field (strict request schema)", async () => {
    const response = await POST(request({ query: "해운대", extra: "nope" }));
    expect(response.status).toBe(400);
    expect(searchByTextMock).not.toHaveBeenCalled();
  });

  it("returns results, parsedQuery, and a null notice for a normal Busan query", async () => {
    const results = [fakeResult()];
    searchByTextMock.mockResolvedValue(results);
    const response = await POST(request({ query: "해운대 맛집" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual(results);
    expect(body.parsedQuery.district).toBe("busan_haeundae_gu");
    expect(body.parsedQuery.keywords).toContain("맛집");
    expect(body.notice).toBeNull();
    expect(searchByTextMock).toHaveBeenCalledWith(expect.objectContaining({ district: "busan_haeundae_gu" }));
  });

  it("reports a district conflict without calling the repository with a guessed district", async () => {
    searchByTextMock.mockResolvedValue([]);
    const response = await POST(request({ query: "해운대랑 서면 사진" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.parsedQuery.districtConflict).toBe(true);
    expect(body.parsedQuery.district).toBeNull();
    expect(searchByTextMock).toHaveBeenCalledWith(expect.objectContaining({ district: null, districtConflict: true }));
  });

  it("reports unsupportedConditions and never lets them drive the search", async () => {
    searchByTextMock.mockResolvedValue([]);
    const response = await POST(request({ query: "조용한 해운대 카페" }));
    const body = await response.json();
    expect(body.unsupportedConditions).toContain("조용한");
    expect(searchByTextMock).toHaveBeenCalledWith(expect.objectContaining({
      unsupportedConditions: expect.arrayContaining(["조용한"]),
    }));
    const [calledWith] = searchByTextMock.mock.calls[0];
    expect(calledWith.keywords).not.toContain("조용한");
  });

  it("returns an empty result with the out-of-scope notice for a non-Busan region, without calling the repository", async () => {
    const response = await POST(request({ query: "서울 카페" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([]);
    expect(body.notice).toEqual({ code: "OUT_OF_SCOPE_REGION", message: expect.stringContaining("부산") });
    expect(searchByTextMock).not.toHaveBeenCalled();
  });

  it("handles special characters, SQL metacharacters, and emoji safely (200, not a crash)", async () => {
    searchByTextMock.mockResolvedValue([]);
    const response = await POST(request({ query: "';DROP TABLE locations;-- 🌊해운대" }));
    expect(response.status).toBe(200);
  });

  it("returns at most 8 results in the TextSearchResult shape", async () => {
    const results = Array.from({ length: 8 }, (_, index) => fakeResult(`loc-${index}`));
    searchByTextMock.mockResolvedValue(results);
    const response = await POST(request({ query: "해운대" }));
    const body = await response.json();
    expect(body.results.length).toBeLessThanOrEqual(8);
    expect(body.results[0]).toMatchObject({
      score: expect.any(Number),
      matchedOn: expect.any(Array),
      location: expect.objectContaining({ id: expect.any(String) }),
    });
  });

  it("maps a repository data-access failure to 503 DATA_UNAVAILABLE without leaking internal detail", async () => {
    const { dataAccessError } = await import("@/shared/errors/application-error");
    searchByTextMock.mockRejectedValue(dataAccessError("Failed to search locations by text", new Error("column locations.secret_column does not exist")));
    const response = await POST(request({ query: "해운대" }));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain("secret_column");
    const body = JSON.parse(text);
    expect(body.error.code).toBe("DATA_UNAVAILABLE");
  });

  it("maps an unexpected repository throw to 500 SEARCH_FAILED without leaking internal detail", async () => {
    searchByTextMock.mockRejectedValue(new Error("supabase-url=https://internal.example/secret-project"));
    const response = await POST(request({ query: "해운대" }));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("internal.example");
    const body = JSON.parse(text);
    expect(body.error.code).toBe("SEARCH_FAILED");
  });

  describe("filters", () => {
    it("400s an unrecognized filters.district value", async () => {
      const response = await POST(request({ query: "해운대", filters: { district: "nowhere" } }));
      expect(response.status).toBe(400);
      expect(searchByTextMock).not.toHaveBeenCalled();
    });

    it("400s an unrecognized filters.category value", async () => {
      const response = await POST(request({ query: "해운대", filters: { category: "nowhere" } }));
      expect(response.status).toBe(400);
      expect(searchByTextMock).not.toHaveBeenCalled();
    });

    it("400s an unknown field inside filters (strict filters schema)", async () => {
      const response = await POST(request({ query: "해운대", filters: { region: "부산" } }));
      expect(response.status).toBe(400);
      expect(searchByTextMock).not.toHaveBeenCalled();
    });

    it("applies a filter when the query text names no district/category", async () => {
      searchByTextMock.mockResolvedValue([]);
      const response = await POST(request({ query: "맛집", filters: { district: "busan_haeundae_gu" } }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.parsedQuery.district).toBe("busan_haeundae_gu");
      expect(body.notice).toBeNull();
      expect(searchByTextMock).toHaveBeenCalledWith(expect.objectContaining({ district: "busan_haeundae_gu" }));
    });

    it("keeps the query text's district when no filter is given", async () => {
      searchByTextMock.mockResolvedValue([]);
      const response = await POST(request({ query: "해운대 맛집" }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.parsedQuery.district).toBe("busan_haeundae_gu");
      expect(body.notice).toBeNull();
    });

    it("has no conflict notice when the filter and the query text name the same district", async () => {
      searchByTextMock.mockResolvedValue([]);
      const response = await POST(request({ query: "해운대 맛집", filters: { district: "busan_haeundae_gu" } }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.parsedQuery.district).toBe("busan_haeundae_gu");
      expect(body.notice).toBeNull();
    });

    it("prefers the filter and reports a conflict notice when the filter and query text name different districts", async () => {
      searchByTextMock.mockResolvedValue([]);
      const response = await POST(request({ query: "해운대 맛집", filters: { district: "busan_suyeong_gu" } }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.parsedQuery.district).toBe("busan_suyeong_gu");
      expect(body.notice).toEqual({ code: "FILTER_OVERRIDES_QUERY", message: expect.stringContaining("지역") });
      expect(searchByTextMock).toHaveBeenCalledWith(expect.objectContaining({ district: "busan_suyeong_gu" }));
    });

    it("prefers the filter and reports a conflict notice when the filter and query text name different categories", async () => {
      searchByTextMock.mockResolvedValue([]);
      const response = await POST(request({ query: "실내 카페", filters: { category: "nature" } }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.parsedQuery.category).toBe("nature");
      expect(body.notice).toEqual({ code: "FILTER_OVERRIDES_QUERY", message: expect.stringContaining("공간 종류") });
      expect(searchByTextMock).toHaveBeenCalledWith(expect.objectContaining({ category: "nature" }));
    });

    it("applies the filter instead of a guessed district when the query text itself conflicts", async () => {
      searchByTextMock.mockResolvedValue([]);
      const response = await POST(request({ query: "해운대랑 서면 사진", filters: { district: "busan_haeundae_gu" } }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.parsedQuery.districtConflict).toBe(true);
      expect(body.parsedQuery.district).toBe("busan_haeundae_gu");
      expect(body.notice).toBeNull();
    });

    it("does not call the repository for an out-of-scope region even with a filter present", async () => {
      const response = await POST(request({ query: "서울 카페", filters: { district: "busan_haeundae_gu" } }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.notice).toEqual({ code: "OUT_OF_SCOPE_REGION", message: expect.stringContaining("부산") });
      expect(searchByTextMock).not.toHaveBeenCalled();
    });
  });
});
