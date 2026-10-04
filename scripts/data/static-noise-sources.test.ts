import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildNoiseCandidateReport, parseOverpassResponse } from "./collect-static-noise-sources.ts";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import {
  applyStaticNoiseSourceCatalog,
  parseStaticNoiseSourceCatalog,
} from "./static-noise-sources.ts";

const locationId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-10-04T12:00:00+09:00");

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
        type: "문의 필요", contactName: null, contactPhone: null, note: null,
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
    attribution: {
      source: "© OpenStreetMap contributors",
      license: "Open Data Commons Open Database License (ODbL) 1.0",
      license_url: "https://www.openstreetmap.org/copyright",
    },
    locations: [{
      location_id: locationId,
      noise_sources: [{
        source_element_id: "way/123",
        kind: "railway",
        description: "인근 지상 철도 시설",
        feature_latitude: 37.501,
        feature_longitude: 127.001,
        evidence: "OpenStreetMap way/123의 railway=rail 태그",
        source: "© OpenStreetMap contributors",
        source_url: "https://www.openstreetmap.org/way/123",
        license: "Open Data Commons Open Database License (ODbL) 1.0",
        license_url: "https://www.openstreetmap.org/copyright",
        reference_date: "2026-07-15",
        last_verified_at: "2026-10-04T11:22:00+09:00",
        ...overrides,
      }],
    }],
  };
}

describe("static expected noise-source data", () => {
  it("maps reviewed OSM metadata without creating a dB value", () => {
    const parsed = parseStaticNoiseSourceCatalog(catalog(), now);
    const output = applyStaticNoiseSourceCatalog(dataset(), parsed);
    expect(output.locations[0].noiseSources).toEqual([expect.objectContaining({
      kind: "railway",
      description: "인근 지상 철도 시설",
      distanceMeters: 142,
      evidence: expect.stringContaining("railway=rail"),
      license: "Open Data Commons Open Database License (ODbL) 1.0",
      provenance: expect.objectContaining({
        sourceUrl: "https://www.openstreetmap.org/way/123",
        lastVerifiedAt: "2026-10-04T11:22:00+09:00",
      }),
    })]);
    expect(JSON.stringify(output.locations[0].noiseSources)).not.toContain("dB");
  });

  it("rejects malformed provenance, stale verification, and duplicate sources", () => {
    expect(() => parseStaticNoiseSourceCatalog(catalog({ source_url: "javascript:alert(1)" }), now)).toThrow();
    expect(() => parseStaticNoiseSourceCatalog(catalog({ last_verified_at: "2024-01-01T00:00:00Z" }), now))
      .toThrow("older than 365 days");
    const duplicate = catalog();
    duplicate.locations[0].noise_sources.push({ ...duplicate.locations[0].noise_sources[0], source_element_id: "way/124" });
    expect(() => parseStaticNoiseSourceCatalog(duplicate, now)).toThrow("duplicates source URL");
  });

  it("keeps only supported visible map features in the review queue", () => {
    const response = parseOverpassResponse({
      osm3s: { timestamp_osm_base: "2026-07-15T00:00:00Z" },
      elements: [{
        type: "way", id: 10, center: { lat: 37.501, lon: 127.001 },
        tags: { railway: "rail", name: "지상선" },
      }, {
        type: "way", id: 11, center: { lat: 37.501, lon: 127.001 },
        tags: { railway: "rail", name: "지하선", tunnel: "yes" },
      }, {
        type: "way", id: 12, center: { lat: 37.501, lon: 127.001 },
        tags: { highway: "residential", name: "이면도로" },
      }],
    });
    const report = buildNoiseCandidateReport(dataset().locations[0], response, "2026-10-04T11:22:00+09:00");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({ kind: "railway", review_required: true });
    expect(report.rejected).toHaveLength(2);
  });

  it("migrates legacy strings and keeps public read-only RLS", async () => {
    const [initial, migration] = await Promise.all([
      readFile("supabase/migrations/20260920000000_initial_schema.sql", "utf8"),
      readFile("supabase/migrations/20261004000001_structured_noise_sources.sql", "utf8"),
    ]);
    expect(migration).toContain("when jsonb_typeof(item) = 'string'");
    expect(migration).toContain("locations_noise_sources_contract_check");
    expect(migration).not.toMatch(/create policy[^;]+locations[^;]+for\s+(insert|update|delete)/i);
    expect(initial).toContain('create policy "public can read locations"');
  });
});
