import { describe, expect, it } from "vitest";
import type { Location } from "@/types/domain";
import {
  busanReviewedContacts,
  findReviewedLocationContacts,
  parseReviewedContactFile,
} from "./contact-review";

function location(overrides: Partial<Location> = {}): Location {
  return {
    id: "5fec204b-6a5a-50f9-8bc7-8cbacf5a94ff",
    name: "감천문화마을", description: "", category: "urban", region: "부산",
    district: "busan_saha_gu", address: "부산광역시 사하구 감내2로 203",
    point: { latitude: 35.0975, longitude: 129.00916667 }, images: [], parking: [], aliases: [], tags: [],
    permit: { type: "문의 필요", contactName: null, contactPhone: null, note: null,
      source: null, sourceUrl: null, referenceDate: null, lastVerifiedAt: null },
    source: null, sourceUrl: null, author: null, license: null, licenseUrl: null, lastVerifiedAt: null,
    ...overrides,
  };
}

describe("Busan reviewed contact file", () => {
  it("rejects a reviewed source URL containing credentials before serving contacts", () => {
    const invalid = structuredClone(busanReviewedContacts);
    invalid.locations[0].contacts[0].sourceUrl = "https://user:password@example.com/contact";
    expect(() => parseReviewedContactFile(invalid)).toThrow();
  });

  it.each(["not a phone", "123", "051-204-1444<script>"])("rejects invalid reviewed phone %s", (phone) => {
    const invalid = structuredClone(busanReviewedContacts);
    invalid.locations[0].contacts[0].phone = phone;
    expect(() => parseReviewedContactFile(invalid)).toThrow();
  });

  it("parses the committed file and classifies the guide center as a place contact", () => {
    expect(busanReviewedContacts.locations.length).toBeGreaterThan(0);
    const resolved = findReviewedLocationContacts(location());
    expect(resolved?.scale).toBe("large");
    expect(resolved?.contacts[0]).toMatchObject({
      contactType: "place_contact",
      contactName: "감천문화마을 안내센터",
      phone: "051-204-1444",
      verification: "official_reviewed",
    });
  });

  it("rejects an ID-only match when the name and physical evidence disagree", () => {
    expect(findReviewedLocationContacts(location({
      name: "다른 장소",
      address: "부산광역시 다른 구 다른로 1",
      point: { latitude: 36, longitude: 128 },
    }))).toBeNull();
  });

  it("rejects a contact type whose facility relationship is inconsistent", () => {
    const invalid = structuredClone(busanReviewedContacts);
    invalid.locations[0].contacts[0] = {
      ...invalid.locations[0].contacts[0],
      contactType: "permit_contact",
      facilityRelationship: "represents_location",
    };
    expect(() => parseReviewedContactFile(invalid)).toThrow();
  });
});
