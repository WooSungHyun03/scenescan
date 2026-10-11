import { describe, expect, it } from "vitest";
import { nearbyParkingResponseSchema } from "@/types/place-discovery";

// Exercises the real route -> location repository -> synthetic parking fixture
// path with the default key-free mock configuration.
const { GET } = await import("./route");
const FIXTURE_ID = "00000000-0000-4000-8000-000000000003";

function request(radius = "1000") {
  return [
    new Request(`http://localhost/api/locations/${FIXTURE_ID}/parking?radius=${radius}`),
    { params: Promise.resolve({ id: FIXTURE_ID }) },
  ] as const;
}

describe("GET /api/locations/[id]/parking (real mock mode)", () => {
  it("returns deterministic, bounded fixture candidates without any Kakao key", async () => {
    const first = await GET(...request());
    const second = await GET(...request());
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = nearbyParkingResponseSchema.parse(await first.json());
    const secondBody = nearbyParkingResponseSchema.parse(await second.json());
    expect(firstBody.sourceMode).toBe("fixture");
    expect(firstBody.candidates.length).toBeGreaterThan(0);
    expect(firstBody.candidates.length).toBeLessThanOrEqual(5);
    expect(firstBody.candidates).toEqual(secondBody.candidates);
  });

  it("widens the result set while preserving the distance order", async () => {
    const near = nearbyParkingResponseSchema.parse(await (await GET(...request("1000"))).json());
    const wide = nearbyParkingResponseSchema.parse(await (await GET(...request("5000"))).json());
    expect(wide.candidates.length).toBeGreaterThan(near.candidates.length);
    expect(wide.candidates.slice(0, near.candidates.length).map((item) => item.id))
      .toEqual(near.candidates.map((item) => item.id));
  });
});
