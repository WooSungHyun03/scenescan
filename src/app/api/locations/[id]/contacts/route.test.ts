import { beforeEach, describe, expect, it, vi } from "vitest";

const getLocationContactsMock = vi.fn();
vi.mock("@/domains/locations/server/contacts", () => ({
  getLocationContacts: (...args: unknown[]) => getLocationContactsMock(...args),
}));

const { GET } = await import("./route");
const ID = "11111111-1111-4111-8111-111111111111";

function response() {
  return {
    locationId: ID, contacts: [], resolution: "unconfirmed" as const, reviewRequired: true,
    reason: "provider_unavailable" as const, sourceMode: "live" as const,
  };
}

function call(id = ID, query = "") {
  return GET(new Request(`http://localhost/api/locations/${id}/contacts${query}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => getLocationContactsMock.mockReset());

describe("GET /api/locations/[id]/contacts", () => {
  it("rejects malformed IDs and unsupported query keys", async () => {
    expect((await call("bad-id")).status).toBe(400);
    expect((await call(ID, "?radius=1000")).status).toBe(400);
    expect(getLocationContactsMock).not.toHaveBeenCalled();
  });

  it("returns the validated no-store contract", async () => {
    getLocationContactsMock.mockResolvedValue(response());
    const result = await call();
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    await expect(result.json()).resolves.toEqual(response());
    expect(getLocationContactsMock).toHaveBeenCalledWith(ID, expect.any(AbortSignal));
  });

  it("rejects a provider contact mislabeled as a permit contact", async () => {
    getLocationContactsMock.mockResolvedValue({
      ...response(),
      contacts: [{
        id: "kakao-local:1", contactType: "permit_contact", contactName: "대표번호",
        phone: "051-123-4567", source: "Kakao Local", sourceUrl: "https://place.map.kakao.com/1",
        lastVerifiedAt: "2026-10-11T00:00:00Z", verification: "provider_suggestion",
        providerPlaceId: "1", distanceMeters: 10, matchBasis: ["name"],
      }],
    });
    expect((await call()).status).toBe(500);
  });
});
