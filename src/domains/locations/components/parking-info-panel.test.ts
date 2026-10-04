import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getParkingRelationshipPresentation, ParkingInfoPanel } from "./parking-info-panel";
import { getAttributionViewModel } from "./source-attribution";

describe("parking detail presentation", () => {
  it("uses the reviewed relationship instead of inferring from location_id", () => {
    expect(getParkingRelationshipPresentation("on_site")).toEqual({
      isOnSite: true,
      label: "장소 자체 주차",
    });
    expect(getParkingRelationshipPresentation("nearby")).toEqual({
      isOnSite: false,
      label: "주변 공영/민영 주차",
    });
  });

  it("links only safe official URLs and formats the verification date", () => {
    expect(getAttributionViewModel({
      source: "공공데이터포털",
      sourceUrl: "https://www.data.go.kr/data/15012896/standard.do",
      lastVerifiedAt: "2026-10-04T12:00:00+09:00",
    })).toMatchObject({
      source: "공공데이터포털",
      sourceUrl: "https://www.data.go.kr/data/15012896/standard.do",
      sourceUrlInvalid: false,
      lastVerifiedAt: "2026년 10월 4일",
    });
    expect(getAttributionViewModel({ sourceUrl: "javascript:alert(1)" })).toMatchObject({
      sourceUrl: null,
      sourceUrlInvalid: true,
    });
  });

  it("renders sourced nearby parking in distance order", () => {
    const common = {
      locationId: "location-1",
      relationship: "nearby" as const,
      capacity: 10,
      openingHours: "매일 00:00–23:59",
      priceInfo: "무료",
      source: "공공데이터포털",
      sourceUrl: "https://www.data.go.kr/data/15012896/standard.do",
      referenceDate: "2026-05-15",
      lastVerifiedAt: "2026-10-04T12:00:00+09:00",
    };
    const html = renderToStaticMarkup(createElement(ParkingInfoPanel, {
      origin: { latitude: 37.5, longitude: 127 },
      parking: [
        { ...common, id: "far", name: "먼 주차장", point: { latitude: 37.51, longitude: 127 } },
        { ...common, id: "near", name: "가까운 주차장", point: { latitude: 37.501, longitude: 127 } },
      ],
    }));

    expect(html.indexOf("가까운 주차장")).toBeLessThan(html.indexOf("먼 주차장"));
    expect(html).toContain("주변 공영/민영 주차");
    expect(html).toContain('href="https://www.data.go.kr/data/15012896/standard.do"');
    expect(html).toContain("2026년 10월 4일");
  });

  it("renders the reviewed DDP production parking record with its official source", () => {
    const production = JSON.parse(readFileSync(resolve("data/production/locations.json"), "utf8")) as {
      locations: Array<{
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        parking: Array<{
          relationship: "on_site" | "nearby";
          name: string;
          latitude: number;
          longitude: number;
          capacity: number | null;
          openingHours: string | null;
          priceInfo: string | null;
          provenance: { source: string; sourceUrl: string; referenceDate: string | null; lastVerifiedAt: string | null };
        }>;
      }>;
    };
    const location = production.locations.find((item) => item.name === "동대문디자인플라자");
    expect(location?.parking).toHaveLength(1);
    const parking = location!.parking[0];
    const html = renderToStaticMarkup(createElement(ParkingInfoPanel, {
      origin: { latitude: location!.latitude, longitude: location!.longitude },
      parking: [{
        id: "reviewed-production-parking",
        locationId: location!.id,
        relationship: parking.relationship,
        name: parking.name,
        point: { latitude: parking.latitude, longitude: parking.longitude },
        capacity: parking.capacity,
        openingHours: parking.openingHours,
        priceInfo: parking.priceInfo,
        source: parking.provenance.source,
        sourceUrl: parking.provenance.sourceUrl,
        referenceDate: parking.provenance.referenceDate,
        lastVerifiedAt: parking.provenance.lastVerifiedAt,
      }],
    }));

    expect(html).toContain("동대문");
    expect(html).toContain("직선거리 243m");
    expect(html).toContain("서울시설공단");
    expect(html).toContain('href="https://www.data.go.kr/data/15012896/standard.do"');
  });
});
