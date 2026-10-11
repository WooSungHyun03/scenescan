import { describe, expect, it } from "vitest";
import { locationContactsResponseSchema } from "@/types/location-contact";

const { GET } = await import("./route");
const FIXTURE_ID = "00000000-0000-4000-8000-000000000003";

describe("GET /api/locations/[id]/contacts (real mock mode)", () => {
  it("returns a deterministic key-free place-contact fixture without calling a real provider", async () => {
    const request = () => GET(
      new Request(`http://localhost/api/locations/${FIXTURE_ID}/contacts`),
      { params: Promise.resolve({ id: FIXTURE_ID }) },
    );
    const first = await request();
    const second = await request();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = locationContactsResponseSchema.parse(await first.json());
    const secondBody = locationContactsResponseSchema.parse(await second.json());
    expect(firstBody.sourceMode).toBe("fixture");
    expect(firstBody.contacts[0]).toMatchObject({
      contactType: "place_contact",
      verification: "provider_suggestion",
      source: "SceneScan synthetic fixture",
    });
    expect(firstBody).toEqual(secondBody);
  });
});
