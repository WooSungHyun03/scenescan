import { describe, expect, it } from "vitest";

// Unlike route.test.ts, this file does NOT mock
// "@/domains/locations/server/repository" -- it exercises the real
// getLocation/getSimilarLocations -> mock-repository.ts path end-to-end,
// proving the route genuinely works in mock mode (NEXT_PUBLIC_USE_MOCK_DATA
// is unset here, which repository.ts treats as mock=true, same as the
// app's own default). That only works because mock fixture ids
// (src/domains/locations/fixtures/locations.ts) are now fixed UUIDs --
// before that change this route always 400'd in mock mode. repository.ts
// unconditionally imports supabase-repository.ts at module scope even
// though mock mode never calls it, which is why this still needs
// "server-only" handled -- see vitest.config.ts's alias for that.
const { GET } = await import("./route");

const FIXTURE_ID = "00000000-0000-4000-8000-000000000001";
const NONEXISTENT_ID = "00000000-0000-4000-8000-000000000099";

function request(id: string) {
  return [new Request(`http://localhost/api/locations/${id}/similar`), { params: Promise.resolve({ id }) }] as const;
}

describe("GET /api/locations/[id]/similar (real mock-mode repository)", () => {
  it("returns 200 with LocationSearchResult[] for a real mock fixture id, excluding the location itself", async () => {
    const response = await GET(...request(FIXTURE_ID));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.length).toBeLessThanOrEqual(8);
    expect(body.results.every((result: { location: { id: string } }) => result.location.id !== FIXTURE_ID)).toBe(true);
  });

  it("404s a well-formed but nonexistent id even in mock mode", async () => {
    const response = await GET(...request(NONEXISTENT_ID));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("LOCATION_NOT_FOUND");
  });
});
