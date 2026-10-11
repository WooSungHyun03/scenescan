import { describe, expect, it, vi } from "vitest";
import type { Location } from "@/types/domain";
import { createFakeKakaoLocalAdapter } from "@/infrastructure/kakao/fake-local-adapter";
import { getLocationContacts } from "./contacts";

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";

function fixture(): Location {
  return {
    id: LOCATION_ID, name: "테스트전시관", description: "", category: "interior",
    region: "부산", district: "busan_nam_gu", address: "부산 남구 테스트로 1",
    point: { latitude: 35.1, longitude: 129.1 }, images: [], parking: [], aliases: [], tags: [],
    permit: { type: "문의 필요", contactName: null, contactPhone: null, note: null,
      source: null, sourceUrl: null, referenceDate: null, lastVerifiedAt: null },
    source: null, sourceUrl: null, author: null, license: null, licenseUrl: null, lastVerifiedAt: null,
  };
}

describe("location contact server service", () => {
  it("does not call Kakao when an official reviewed permit contact exists", async () => {
    const adapter = { searchByKeyword: vi.fn(), searchByCategory: vi.fn() };
    const location = fixture();
    location.permit = {
      type: "기관 직접 문의", contactName: "촬영 담당 부서", contactPhone: "051-111-1111",
      note: null, source: "공식 촬영 안내", sourceUrl: "https://example.go.kr/filming",
      referenceDate: null, lastVerifiedAt: "2026-10-10T00:00:00+09:00",
    };
    const result = await getLocationContacts(LOCATION_ID, undefined, {
      location, adapter, reviewedFile: { schemaVersion: 1, reviewedAt: "2026-10-11T00:00:00+09:00", locations: [] },
      sourceMode: "live",
    });
    expect(result.contacts[0].contactType).toBe("permit_contact");
    expect(adapter.searchByKeyword).not.toHaveBeenCalled();
  });

  it("returns an honest unconfirmed response without a provider key", async () => {
    const result = await getLocationContacts(LOCATION_ID, undefined, {
      location: fixture(), adapter: null,
      reviewedFile: { schemaVersion: 1, reviewedAt: "2026-10-11T00:00:00+09:00", locations: [] },
      sourceMode: "live",
    });
    expect(result).toMatchObject({ resolution: "unconfirmed", reason: "provider_unavailable", contacts: [] });
  });

  it("queries a bounded area and returns only a place-contact suggestion", async () => {
    const adapter = createFakeKakaoLocalAdapter([{
      id: "123", name: "테스트전시관", categoryName: "문화시설", categoryGroupCode: "CT1",
      categoryGroupName: "문화시설", phone: "051-123-4567", address: "부산 남구 테스트로 1",
      roadAddress: "부산 남구 테스트로 1", point: { latitude: 35.1001, longitude: 129.1001 },
      placeUrl: "https://place.map.kakao.com/123", distanceMeters: null, source: "Kakao Local",
    }]);
    const spy = vi.spyOn(adapter, "searchByKeyword");
    const result = await getLocationContacts(LOCATION_ID, undefined, {
      location: fixture(), adapter,
      reviewedFile: { schemaVersion: 1, reviewedAt: "2026-10-11T00:00:00+09:00", locations: [] },
      sourceMode: "live", now: new Date("2026-10-11T00:00:00Z"),
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ radiusMeters: 500, size: 5 }), expect.anything());
    expect(result.contacts[0]).toMatchObject({ contactType: "place_contact", verification: "provider_suggestion" });
  });
});
