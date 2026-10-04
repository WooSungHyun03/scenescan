import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import { buildParkingCandidateReport, normalizePortalParkingRow, parsePortalParkingPage } from "./collect-static-parking.ts";
import { applyStaticParkingCatalog, parseStaticParkingCatalog } from "./static-parking.ts";

const locationId = "00000000-0000-4000-8000-000000000001";

function dataset() {
  return parseNormalizedLocationOutput({
    schemaVersion: 2,
    source: { name: "test" },
    locations: [{
      id: locationId,
      name: "테스트 장소",
      description: "설명",
      category: "urban",
      region: "서울",
      address: "주소",
      latitude: 37.5,
      longitude: 127,
      permit: {
        type: "문의 필요",
        contactName: null,
        contactPhone: null,
        note: null,
        provenance: { source: "official", sourceUrl: "https://example.com", referenceDate: null, lastVerifiedAt: null },
      },
      parking: [],
      images: [{ imagePath: "image.jpg", imageUrl: "https://example.com/image.jpg", alt: "이미지" }],
      sourceUrl: "https://example.com",
      provenance: { source: "official", sourceUrl: "https://example.com", referenceDate: null, lastVerifiedAt: null },
    }],
    reviewQueue: [],
  });
}

function catalog(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    locations: [{
      location_id: locationId,
      parking: [{
        source_record_id: "source-1",
        relationship: "nearby",
        name: "테스트 공영주차장",
        latitude: 37.501,
        longitude: 127.001,
        capacity: 12,
        opening_hours: "평일 09:00–18:00",
        price_info: "무료",
        source: "공식 데이터",
        source_url: "https://www.data.go.kr/data/15012896/standard.do",
        reference_date: "2026-05-15",
        last_verified_at: "2026-10-04T12:00:00+09:00",
        ...overrides,
      }],
    }],
  };
}

describe("static parking collection and catalog", () => {
  it("parses the official API envelope and preserves only static fields", () => {
    const row = {
      prkplceNo: "101-2-000004",
      prkplceNm: "동대문",
      prkcmprt: "1092",
      operDay: "평일+토요일+공휴일",
      weekdayOperOpenHhmm: "00:00",
      weekdayOperColseHhmm: "23:59",
      parkingchrgeInfo: "유료",
      basicTime: "5",
      basicCharge: "360",
      latitude: "37.567102",
      longitude: "127.012141",
      institutionNm: "서울시설공단",
      referenceDate: "2026-05-15",
    };
    const page = parsePortalParkingPage({
      response: { header: { resultCode: "00" }, body: { pageNo: 1, numOfRows: 1000, totalCount: 1, items: [row] } },
    });
    expect(page.items).toHaveLength(1);
    expect(normalizePortalParkingRow(row)).toMatchObject({
      sourceRecordId: "101-2-000004",
      capacity: 1092,
      priceInfo: "유료 · 기본 5분 360원",
      referenceDate: "2026-05-15",
    });
  });

  it("filters closed facilities and assigns only candidates within 1.5km", () => {
    const rows = [{
      prkplceNo: "near",
      prkplceNm: "주변 주차장",
      prkcmprt: "10",
      latitude: "37.501",
      longitude: "127.001",
      institutionNm: "지자체",
      referenceDate: "2026-05-15",
    }, {
      prkplceNo: "closed",
      prkplceNm: "폐쇄 주차장",
      latitude: "37.501",
      longitude: "127.001",
      referenceDate: "2026-05-15",
    }, {
      prkplceNo: "far",
      prkplceNm: "먼 주차장",
      latitude: "38.5",
      longitude: "128",
      referenceDate: "2026-05-15",
    }];
    const report = buildParkingCandidateReport(dataset(), rows, "2026-10-04T12:00:00+09:00");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      source_record_id: "near",
      nearest_location_id: locationId,
      relationship_requires_manual_review: true,
    });
    expect(report.rejected).toEqual([{ sourceRecordId: "closed", reason: "facility is marked closed or unavailable" }]);
  });

  it("rejects duplicate physical parking and out-of-range reviewed assignments", () => {
    const duplicate = catalog();
    duplicate.locations.push({
      location_id: "00000000-0000-4000-8000-000000000002",
      parking: [{ ...duplicate.locations[0].parking[0], source_record_id: "source-2" }],
    });
    expect(() => parseStaticParkingCatalog(duplicate)).toThrow("duplicates");
    const parsed = parseStaticParkingCatalog(catalog({ latitude: 38.5, longitude: 128 }));
    expect(() => applyStaticParkingCatalog(dataset(), parsed)).toThrow("nearby parking must be within");
  });

  it("keeps parking RLS public-read-only and adds reviewed metadata columns", async () => {
    const [initial, metadata] = await Promise.all([
      readFile("supabase/migrations/20260920000000_initial_schema.sql", "utf8"),
      readFile("supabase/migrations/20261004000000_static_parking_metadata.sql", "utf8"),
    ]);
    expect(initial).toContain("alter table public.parking enable row level security");
    expect(initial).toContain('create policy "public can read parking"');
    expect(initial).not.toMatch(/create policy[^;]+parking[^;]+for\s+(insert|update|delete)/i);
    expect(metadata).toContain("add column relationship");
    expect(metadata).toContain("add column source_url");
    expect(metadata).toContain("alter table public.parking enable row level security");
  });
});
