import { beforeEach, describe, expect, it, vi } from "vitest";

// route.ts imports repository.ts, which unconditionally imports
// supabase-repository.ts at module scope (even though it's only called in
// real mode) -- that file starts with `import "server-only"`, which throws
// outside Next.js's bundler. Mocking the whole repository module (below)
// means the real repository.ts (and its "server-only" import) is never
// evaluated, so no separate `vi.mock("server-only", ...)` is needed here --
// unlike src/domains/locations/server/supabase-repository.test.ts, which
// deliberately exercises the real module and does need it.
const searchByImageMock = vi.fn();
vi.mock("@/domains/locations/server/repository", () => ({
  searchByImage: (...args: unknown[]) => searchByImageMock(...args),
}));

const { POST } = await import("./route");

function request(body: unknown, init: { headers?: Record<string, string>; rawBody?: string } = {}) {
  const payload = init.rawBody ?? JSON.stringify(body);
  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init.headers },
    body: payload,
  });
}

function validEmbedding(): number[] {
  return Array(512).fill(0).map((_, index) => (index === 0 ? 1 : 0));
}

function fakeResult(id = "loc-1") {
  return {
    location: {
      id, name: "테스트", description: "", category: "urban" as const, region: "서울" as const, address: "",
      point: { latitude: 0, longitude: 0 }, images: [], permit: { type: "", contactName: null, contactPhone: null, note: null },
      parking: [], noiseSources: [], sourceUrl: null,
    },
    similarity: 0.9,
    matchedImageId: "img-1",
  };
}

beforeEach(() => {
  searchByImageMock.mockReset();
});

describe("POST /api/search", () => {
  it("returns a successful response shape unchanged: { results: LocationSearchResult[] }", async () => {
    const results = Array.from({ length: 8 }, (_, index) => fakeResult(`loc-${index}`));
    searchByImageMock.mockResolvedValue(results);
    const response = await POST(request({ embedding: validEmbedding(), filters: {} }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results });
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it("passes embedding, filters, and threshold through to searchByImage", async () => {
    searchByImageMock.mockResolvedValue([]);
    await POST(request({ embedding: validEmbedding(), filters: { region: "서울" }, threshold: 0.5 }));
    expect(searchByImageMock).toHaveBeenCalledWith(validEmbedding(), { region: "서울" }, { threshold: 0.5 });
  });

  it("ignores a client-supplied count -- match_count is a fixed server constant, not part of this request contract", async () => {
    searchByImageMock.mockResolvedValue([]);
    await POST(request({ embedding: validEmbedding(), count: 5 }));
    expect(searchByImageMock).toHaveBeenCalledWith(validEmbedding(), {}, { threshold: undefined });
  });

  it("400s a 511-length embedding", async () => {
    const response = await POST(request({ embedding: validEmbedding().slice(1) }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(searchByImageMock).not.toHaveBeenCalled();
  });

  it("400s a 513-length embedding", async () => {
    const response = await POST(request({ embedding: [...validEmbedding(), 0.1] }));
    expect(response.status).toBe(400);
  });

  it("400s an embedding containing NaN", async () => {
    const embedding = validEmbedding();
    embedding[10] = Number.NaN;
    const response = await POST(request({ embedding }));
    expect(response.status).toBe(400);
  });

  it("400s an embedding containing a string value", async () => {
    const response = await POST(request(undefined, { rawBody: JSON.stringify({ embedding: [...validEmbedding().slice(0, 511), "not-a-number"] }) }));
    expect(response.status).toBe(400);
  });

  it("400s an all-zero embedding", async () => {
    const response = await POST(request({ embedding: Array(512).fill(0) }));
    expect(response.status).toBe(400);
  });

  it("400s a disallowed region", async () => {
    const response = await POST(request({ embedding: validEmbedding(), filters: { region: "제주" } }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("400s invalid JSON", async () => {
    const response = await POST(request(undefined, { rawBody: "{not json" }));
    expect(response.status).toBe(400);
  });

  it("400s a body over the size cap without calling the repository", async () => {
    const response = await POST(request(undefined, { rawBody: JSON.stringify({ embedding: validEmbedding(), filters: { note: "x".repeat(40_000) } }) }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(searchByImageMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized body using Content-Length before reading it", async () => {
    const response = await POST(request(undefined, { rawBody: JSON.stringify({ embedding: validEmbedding() }), headers: { "content-length": String(64 * 1024) } }));
    expect(response.status).toBe(400);
    expect(searchByImageMock).not.toHaveBeenCalled();
  });

  it("maps a repository data-access failure to 503 DATA_UNAVAILABLE without leaking internal detail", async () => {
    const { dataAccessError } = await import("@/shared/errors/application-error");
    searchByImageMock.mockRejectedValue(dataAccessError("Failed to search location images", new Error("column locations.secret_column does not exist")));
    const response = await POST(request({ embedding: validEmbedding() }));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain("secret_column");
    expect(text).not.toContain("locations.");
    const body = JSON.parse(text);
    expect(body.error.code).toBe("DATA_UNAVAILABLE");
  });

  it("maps an unexpected repository throw to 500 SEARCH_FAILED without leaking internal detail", async () => {
    searchByImageMock.mockRejectedValue(new Error("supabase-url=https://internal.example/secret-project"));
    const response = await POST(request({ embedding: validEmbedding() }));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("internal.example");
    expect(text).not.toContain("secret-project");
    const body = JSON.parse(text);
    expect(body.error.code).toBe("SEARCH_FAILED");
  });

  it("returns at most 8 results and the LocationSearchResult shape for a normal request", async () => {
    const results = [fakeResult()];
    searchByImageMock.mockResolvedValue(results);
    const response = await POST(request({ embedding: validEmbedding() }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results.length).toBeLessThanOrEqual(8);
    expect(body.results[0]).toMatchObject({ similarity: expect.any(Number), matchedImageId: expect.any(String), location: expect.objectContaining({ id: expect.any(String) }) });
  });
});
