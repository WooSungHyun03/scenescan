import { describe, expect, it } from "vitest";
import type { Location } from "@/types/domain";
import type { DiscoveredPlace } from "@/types/place-discovery";
import { resolveLocationContacts } from "./contact-resolver";

function location(overrides: Partial<Location> = {}): Location {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "테스트미술관",
    description: "",
    category: "interior",
    region: "부산",
    district: "busan_nam_gu",
    address: "부산광역시 남구 테스트로 10",
    point: { latitude: 35.1, longitude: 129.1 },
    images: [],
    permit: {
      type: "문의 필요",
      contactName: null,
      contactPhone: null,
      note: null,
      source: null,
      sourceUrl: null,
      referenceDate: null,
      lastVerifiedAt: null,
    },
    parking: [], aliases: [], tags: [], source: null, sourceUrl: null,
    author: null, license: null, licenseUrl: null, lastVerifiedAt: null,
    ...overrides,
  };
}

function place(overrides: Partial<DiscoveredPlace> = {}): DiscoveredPlace {
  return {
    id: "12345",
    name: "테스트미술관",
    categoryName: "문화,예술 > 미술관",
    categoryGroupCode: "CT1",
    categoryGroupName: "문화시설",
    phone: "051-123-4567",
    address: "부산광역시 남구 테스트로 10",
    roadAddress: "부산광역시 남구 테스트로 10",
    point: { latitude: 35.1001, longitude: 129.1001 },
    placeUrl: "https://place.map.kakao.com/12345",
    distanceMeters: 14,
    source: "Kakao Local",
    ...overrides,
  };
}

describe("location contact resolver", () => {
  it("keeps a Kakao number as a place contact and requires review", () => {
    const result = resolveLocationContacts({
      location: location(), reviewed: null, providerPlaces: [place()], providerAvailable: true,
      sourceMode: "live", now: new Date("2026-10-11T00:00:00Z"),
    });
    expect(result).toMatchObject({ resolution: "provider_suggestion", reviewRequired: true });
    expect(result.contacts[0]).toMatchObject({
      contactType: "place_contact",
      verification: "provider_suggestion",
      phone: "051-123-4567",
    });
  });

  it("never substitutes the nearest shop for the facility", () => {
    const result = resolveLocationContacts({
      location: location(), reviewed: null,
      providerPlaces: [place({
        id: "777", name: "테스트미술관 앞 카페", categoryGroupCode: "CE7",
        phone: "051-777-7777", point: { latitude: 35.1, longitude: 129.1 },
        placeUrl: "https://place.map.kakao.com/777",
      })],
      providerAvailable: true, sourceMode: "live",
    });
    expect(result).toMatchObject({ resolution: "unconfirmed", reason: "no_match", contacts: [] });
  });

  it("leaves equally plausible matches unconfirmed", () => {
    const result = resolveLocationContacts({
      location: location(), reviewed: null,
      providerPlaces: [place(), place({ id: "54321", placeUrl: "https://place.map.kakao.com/54321" })],
      providerAvailable: true, sourceMode: "live",
    });
    expect(result).toMatchObject({ reason: "ambiguous_provider_match", reviewRequired: true, contacts: [] });
  });

  it("prioritizes reviewed official contacts and does not add a provider suggestion", () => {
    const result = resolveLocationContacts({
      location: location(),
      reviewed: {
        scale: "bounded",
        contacts: [{
          id: "reviewed:management", contactType: "management_contact",
          contactName: "공식 관리팀", phone: "051-111-1111", source: "공식 홈페이지",
          sourceUrl: "https://example.go.kr/contact", lastVerifiedAt: "2026-10-11T00:00:00Z",
          verification: "official_reviewed", providerPlaceId: null, distanceMeters: null,
          matchBasis: ["location_id", "facility_relationship"],
        }],
      },
      providerPlaces: [place()], providerAvailable: true, sourceMode: "live",
    });
    expect(result).toMatchObject({ resolution: "official", reviewRequired: false });
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].contactType).toBe("management_contact");
  });

  it("does not promote a bare phone number to verified permit contact", () => {
    const result = resolveLocationContacts({
      location: location({ permit: {
        ...location().permit,
        contactName: "대표번호",
        contactPhone: "051-222-2222",
      } }),
      reviewed: null, providerAvailable: false, sourceMode: "live",
    });
    expect(result.contacts).toEqual([]);
    expect(result.reason).toBe("provider_unavailable");
  });

  it("requires manual review for a large place instead of auto-matching", () => {
    const result = resolveLocationContacts({
      location: location({ name: "테스트대학교" }), reviewed: null,
      providerPlaces: [place({ name: "테스트대학교" })], providerAvailable: true, sourceMode: "live",
    });
    expect(result).toMatchObject({ reason: "large_site_requires_review", contacts: [] });
  });

  it("leaves empty-phone provider results unconfirmed", () => {
    const result = resolveLocationContacts({
      location: location(), reviewed: null, providerPlaces: [place({ phone: null })],
      providerAvailable: true, sourceMode: "live",
    });
    expect(result).toMatchObject({ reason: "no_phone", contacts: [] });
  });
});
