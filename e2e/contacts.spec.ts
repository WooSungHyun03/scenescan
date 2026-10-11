import { expect, test } from "@playwright/test";

const locationId = "00000000-0000-4000-8000-000000000003";

function contact(contactType: "management_contact" | "place_contact", verification: "official_reviewed" | "provider_suggestion") {
  return {
    id: `${verification}:123`, contactType, contactName: "테스트 대표 안내처",
    phone: "051-123-4567", source: verification === "official_reviewed" ? "공식 홈페이지" : "Kakao Local",
    sourceUrl: verification === "official_reviewed" ? "https://example.go.kr/contact" : "https://place.map.kakao.com/123",
    lastVerifiedAt: "2026-10-11T00:00:00+09:00", verification,
    providerPlaceId: verification === "provider_suggestion" ? "123" : null,
    distanceMeters: verification === "provider_suggestion" ? 20 : null,
    matchBasis: ["name", "coordinate", "facility_relationship"],
  };
}

test("Kakao 대표번호는 촬영 허가 담당번호와 구분해 표시한다", async ({ page }) => {
  await page.route("**/api/locations/*/contacts", (route) => route.fulfill({ json: {
    locationId,
    contacts: [contact("place_contact", "provider_suggestion")],
    resolution: "provider_suggestion",
    reviewRequired: true,
    reason: "provider_contact_suggested",
    sourceMode: "fixture",
  } }));
  await page.goto(`/locations/${locationId}`);
  const permit = page.getByRole("region", { name: "촬영 허가" });
  await expect(permit.getByText("장소 대표 연락처", { exact: true })).toBeVisible();
  await expect(permit.getByText("자동 추천 · 미확인", { exact: true })).toBeVisible();
  await expect(permit.getByText("촬영 허가 검증 상태를 높이지 않습니다", { exact: false })).toBeVisible();
  await expect(permit.getByRole("link", { name: "051-123-4567" })).toHaveAttribute("href", "tel:0511234567");
  await expect(permit.getByText("촬영 허가 문의", { exact: true })).toHaveCount(0);
});

test("공식 관리기관 연락처는 별도 유형과 출처로 표시한다", async ({ page }) => {
  await page.route("**/api/locations/*/contacts", (route) => route.fulfill({ json: {
    locationId,
    contacts: [contact("management_contact", "official_reviewed")],
    resolution: "official",
    reviewRequired: false,
    reason: "official_contact_available",
    sourceMode: "live",
  } }));
  await page.goto(`/locations/${locationId}`);
  const permit = page.getByRole("region", { name: "촬영 허가" });
  await expect(permit.getByText("시설 관리 문의", { exact: true })).toBeVisible();
  await expect(permit.getByText("공식 원문 검수", { exact: true })).toBeVisible();
  await expect(permit.getByRole("link", { name: "출처 확인" })).toHaveAttribute("href", "https://example.go.kr/contact");
  await expect(permit.getByText("촬영 허가 담당 여부는 통화 시 별도로 확인", { exact: false })).toBeVisible();
});
