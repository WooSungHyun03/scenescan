import { beforeEach, describe, expect, it, vi } from "vitest";

// See src/app/api/search/route.test.ts for why mocking the whole repository
// module (rather than vi.mock("server-only", ...)) is sufficient here too.
const getLocationMock = vi.fn();
const getSimilarLocationsMock = vi.fn();
vi.mock("@/domains/locations/server/repository", () => ({
  getLocation: (...args: unknown[]) => getLocationMock(...args),
  getSimilarLocations: (...args: unknown[]) => getSimilarLocationsMock(...args),
}));

const { GET } = await import("./route");

const VALID_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function request(id: string) {
  return [new Request(`http://localhost/api/locations/${id}/similar`), { params: Promise.resolve({ id }) }] as const;
}

function fakeLocation(id: string) {
  return {
    id, name: "테스트", description: "", category: "urban" as const, region: "서울" as const, address: "",
    point: { latitude: 0, longitude: 0 }, images: [], permit: { type: "", contactName: null, contactPhone: null, note: null },
    parking: [], noiseSources: [], sourceUrl: null,
  };
}

function fakeResult(id: string) {
  return { location: fakeLocation(id), similarity: 0.8, matchedImageId: "img-1" };
}

beforeEach(() => {
  getLocationMock.mockReset();
  getSimilarLocationsMock.mockReset();
});

describe("GET /api/locations/[id]/similar", () => {
  it("validates and deduplicates seen location IDs before retrieval", async () => {
    getLocationMock.mockResolvedValue(fakeLocation(VALID_ID));
    getSimilarLocationsMock.mockResolvedValue([]);
    const response = await GET(new Request(`http://localhost/api/locations/${VALID_ID}/similar?exclude=${OTHER_ID}&exclude=${OTHER_ID}`), { params: Promise.resolve({ id: VALID_ID }) });
    expect(response.status).toBe(200);
    expect(getSimilarLocationsMock).toHaveBeenCalledWith(VALID_ID, [OTHER_ID]);
    const invalid = await GET(new Request(`http://localhost/api/locations/${VALID_ID}/similar?exclude=bad`), { params: Promise.resolve({ id: VALID_ID }) });
    expect(invalid.status).toBe(400);
  });
  it("400s a non-uuid id without calling the repository", async () => {
    const response = await GET(...request("demo-01"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(getLocationMock).not.toHaveBeenCalled();
    expect(getSimilarLocationsMock).not.toHaveBeenCalled();
  });

  it("400s an empty id", async () => {
    const response = await GET(...request(""));
    expect(response.status).toBe(400);
  });

  it("404s a well-formed id that does not exist, with LOCATION_NOT_FOUND", async () => {
    getLocationMock.mockResolvedValue(null);
    const response = await GET(...request(VALID_ID));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("LOCATION_NOT_FOUND");
    expect(getSimilarLocationsMock).not.toHaveBeenCalled();
  });

  it("returns [] (not an error) when the location exists but has no candidates", async () => {
    getLocationMock.mockResolvedValue(fakeLocation(VALID_ID));
    getSimilarLocationsMock.mockResolvedValue([]);
    const response = await GET(...request(VALID_ID));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [] });
  });

  it("never includes the location itself in the results", async () => {
    getLocationMock.mockResolvedValue(fakeLocation(VALID_ID));
    getSimilarLocationsMock.mockResolvedValue([fakeResult(OTHER_ID)]);
    const response = await GET(...request(VALID_ID));
    const body = await response.json();
    expect(body.results.every((result: { location: { id: string } }) => result.location.id !== VALID_ID)).toBe(true);
    expect(getSimilarLocationsMock).toHaveBeenCalledWith(VALID_ID, []);
  });

  it("returns up to 8 results in the LocationSearchResult shape", async () => {
    getLocationMock.mockResolvedValue(fakeLocation(VALID_ID));
    const results = Array.from({ length: 8 }, (_, index) => fakeResult(`33333333-3333-4333-8333-33333333333${index}`));
    getSimilarLocationsMock.mockResolvedValue(results);
    const response = await GET(...request(VALID_ID));
    const body = await response.json();
    expect(body.results.length).toBeLessThanOrEqual(8);
    expect(body.results[0]).toMatchObject({ similarity: expect.any(Number), matchedImageId: expect.any(String), location: expect.objectContaining({ id: expect.any(String) }) });
  });

  it("maps a repository failure to the shared error contract without leaking internal detail", async () => {
    getLocationMock.mockResolvedValue(fakeLocation(VALID_ID));
    getSimilarLocationsMock.mockRejectedValue(new Error("column location_images.secret_column does not exist"));
    const response = await GET(...request(VALID_ID));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret_column");
    const body = JSON.parse(text);
    expect(body.error.code).toBe("SEARCH_FAILED");
    expect(body.requestId).toEqual(expect.any(String));
  });
});
