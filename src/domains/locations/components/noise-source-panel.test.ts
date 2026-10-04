import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NoiseSource } from "@/types/domain";
import { NoiseSourcePanel } from "./noise-source-panel";

const reviewed: NoiseSource = {
  kind: "railway",
  description: "경원선 지상 철도 본선이 공개 지도에서 확인됩니다.",
  distanceMeters: 258,
  evidence: "OpenStreetMap way/1025048901의 railway=rail 태그",
  source: "© OpenStreetMap contributors",
  sourceUrl: "https://www.openstreetmap.org/way/1025048901",
  license: "Open Data Commons Open Database License (ODbL) 1.0",
  licenseUrl: "https://www.openstreetmap.org/copyright",
  referenceDate: "2026-07-15",
  lastVerifiedAt: "2026-10-04T11:22:00+09:00",
};

describe("NoiseSourcePanel", () => {
  it("shows structured evidence, distance, source, license, and verification metadata", () => {
    const html = renderToStaticMarkup(createElement(NoiseSourcePanel, { noiseSources: [reviewed] }));
    expect(html).toContain("철도");
    expect(html).toContain("지도상 약 258m");
    expect(html).toContain("railway=rail");
    expect(html).toContain("OpenStreetMap contributors");
    expect(html).toContain("Open Data Commons Open Database License");
    expect(html).toContain("지도 기준일 2026-07-15");
    expect(html).toContain("https://www.openstreetmap.org/way/1025048901");
    expect(html).not.toContain("dB</");
  });

  it("keeps an honest empty state when no trusted source exists", () => {
    const html = renderToStaticMarkup(createElement(NoiseSourcePanel, { noiseSources: [] }));
    expect(html).toContain("확인된 주변 소음 정보가 없습니다");
    expect(html).toContain("소음이 없다는 의미는 아니므로");
  });

  it("warns when verification is stale", () => {
    const html = renderToStaticMarkup(createElement(NoiseSourcePanel, { noiseSources: [{
      ...reviewed,
      lastVerifiedAt: "2024-01-01T00:00:00Z",
    }] }));
    expect(html).toContain("확인 후 1년이 지났거나");
  });

  it("renders the reviewed Wangsimni production sources on the actual detail contract", () => {
    const production = JSON.parse(readFileSync(resolve("data/production/locations.json"), "utf8")) as {
      locations: Array<{
        name: string;
        noiseSources: Array<{
          kind: NoiseSource["kind"];
          description: string;
          distanceMeters: number | null;
          evidence: string | null;
          license: string;
          licenseUrl: string;
          provenance: { source: string; sourceUrl: string; referenceDate: string | null; lastVerifiedAt: string | null };
        }>;
      }>;
    };
    const location = production.locations.find((item) => item.name === "왕십리역");
    expect(location?.noiseSources).toHaveLength(2);
    const noiseSources: NoiseSource[] = location!.noiseSources.map((source) => ({
      kind: source.kind,
      description: source.description,
      distanceMeters: source.distanceMeters,
      evidence: source.evidence,
      source: source.provenance.source,
      sourceUrl: source.provenance.sourceUrl,
      license: source.license,
      licenseUrl: source.licenseUrl,
      referenceDate: source.provenance.referenceDate,
      lastVerifiedAt: source.provenance.lastVerifiedAt,
    }));
    const html = renderToStaticMarkup(createElement(NoiseSourcePanel, { noiseSources }));
    expect(html).toContain("경원선");
    expect(html).toContain("왕십리로");
    expect(html).toContain("지도상 약 258m");
    expect(html).toContain("지도상 약 353m");
    expect(html).toContain("https://www.openstreetmap.org/way/1025048901");
    expect(html).toContain("https://www.openstreetmap.org/way/218797187");
  });
});
