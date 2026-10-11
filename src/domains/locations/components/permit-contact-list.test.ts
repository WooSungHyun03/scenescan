import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LocationContactsResponse } from "@/types/location-contact";
import { PermitContactResults } from "./permit-contact-list";

function response(contactType: "permit_contact" | "management_contact" | "place_contact", verification: "official_reviewed" | "provider_suggestion" = "official_reviewed"): LocationContactsResponse {
  return {
    locationId: "11111111-1111-4111-8111-111111111111",
    contacts: [{
      id: "contact:1", contactType, contactName: "대표 안내처", phone: "051-123-4567",
      source: verification === "provider_suggestion" ? "Kakao Local" : "공식 홈페이지",
      sourceUrl: "https://example.com/contact", lastVerifiedAt: "2026-10-11T00:00:00+09:00",
      verification, providerPlaceId: verification === "provider_suggestion" ? "123" : null,
      distanceMeters: verification === "provider_suggestion" ? 10 : null,
      matchBasis: ["name", "facility_relationship"],
    }],
    resolution: verification === "provider_suggestion" ? "provider_suggestion" : "official",
    reviewRequired: verification === "provider_suggestion",
    reason: verification === "provider_suggestion" ? "provider_contact_suggested" : "official_contact_available",
    sourceMode: "live",
  };
}

describe("permit contact presentation", () => {
  it("renders a valid telephone link for an official management contact", () => {
    const html = renderToStaticMarkup(createElement(PermitContactResults, { response: response("management_contact") }));
    expect(html).toContain("시설 관리 문의");
    expect(html).toContain('href="tel:0511234567"');
    expect(html).toContain("촬영 허가 담당 여부는 통화 시 별도로 확인");
  });

  it("labels a Kakao number as a place suggestion, never as a permit contact", () => {
    const html = renderToStaticMarkup(createElement(PermitContactResults, {
      response: response("place_contact", "provider_suggestion"),
    }));
    expect(html).toContain("장소 대표 연락처");
    expect(html).toContain("자동 추천 · 미확인");
    expect(html).toContain("촬영 허가 검증 상태를 높이지 않습니다");
    expect(html).not.toContain("촬영 허가 문의</h4>");
  });
});
