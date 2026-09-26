import { describe, expect, it } from "vitest";
import { parseSourceMapping } from "./contracts.ts";
import { normalizeDataset } from "./normalizer.ts";

const mapping = parseSourceMapping({
  schemaVersion: 1,
  source: {
    name: "licensed-source",
    defaultSourceUrl: "https://example.com/license",
    referenceDate: "2026-08-31",
    lastVerifiedAt: "2026-09-20T00:00:00Z",
  },
  recordsPath: "payload.places",
  fields: {
    id: "location_uuid",
    name: "title",
    description: "details.summary",
    category: "kind",
    region: "area",
    address: "location.address",
    latitude: "location.lat",
    longitude: "location.lon",
    sourceUrl: "links.source",
  },
  permit: {
    type: "production.permit",
    contactName: "production.contact.name",
    contactPhone: "production.contact.phone",
    note: "production.note",
  },
  provenance: {
    location: {
      source: "links.publisher",
      referenceDate: "metadata.referenceDate",
    },
    permit: {
      source: "production.source.name",
      sourceUrl: "production.source.url",
      lastVerifiedAt: "production.source.lastVerifiedAt",
    },
  },
  parking: {
    path: "nearbyParking",
    id: "id",
    name: "name",
    latitude: "point.lat",
    longitude: "point.lon",
    capacity: "capacity",
    openingHours: "openingHours",
    priceInfo: "priceInfo",
    provenance: {
      source: "source.name",
      sourceUrl: "source.url",
      referenceDate: "source.referenceDate",
      lastVerifiedAt: "source.lastVerifiedAt",
    },
  },
  images: { path: "media.images", url: "url", alt: "caption", localPath: "local_path" },
  categoryMap: { warehouse: "industrial" },
  regionMap: { Seoul: "서울" },
  permitTypeMap: { "Contact first": "문의 필요" },
  defaults: { description: "", permitType: "문의 필요" },
});

describe("normalizeDataset", () => {
  it("maps a provider-specific record into the canonical SceneScan fields", () => {
    const output = normalizeDataset({
      payload: {
        places: [{
          location_uuid: "00000000-0000-4000-8000-000000000101",
          title: "  Sample Warehouse  ",
          details: { summary: "  Licensed sample  " },
          kind: "warehouse",
          area: "Seoul",
          location: { address: " 1 Example-ro ", lat: "37.55", lon: 126.97 },
          production: {
            permit: "Contact first",
            contact: { name: "Location office", phone: "02-0000-0000" },
            note: "Weekdays only",
            source: {
              name: "Location office notice",
              url: "https://example.com/places/1/permit",
              lastVerifiedAt: "2026-09-21T09:30:00+09:00",
            },
          },
          metadata: { referenceDate: "2026-09-01" },
          nearbyParking: [{
            id: "parking-1",
            name: "Example public parking",
            point: { lat: 37.551, lon: 126.971 },
            capacity: "24",
            openingHours: "09:00-22:00",
            priceInfo: "Paid",
            source: {
              name: "City parking API",
              url: "https://example.com/parking/1",
              referenceDate: "2026-09-02",
              lastVerifiedAt: "2026-09-22T10:00:00Z",
            },
          }],
          media: { images: [
            { url: "https://example.com/one.jpg", caption: "Exterior", local_path: "images/one.jpg" },
            { url: "https://example.com/two.jpg", caption: "", local_path: "images/two.jpg" },
          ] },
          links: { source: "https://example.com/places/1", publisher: "Provider place catalog" },
        }],
      },
    }, mapping);

    expect(output).toEqual({
      schemaVersion: 2,
      source: { name: "licensed-source" },
      locations: [{
        id: "00000000-0000-4000-8000-000000000101",
        name: "Sample Warehouse",
        description: "Licensed sample",
        category: "industrial",
        region: "서울",
        address: "1 Example-ro",
        latitude: 37.55,
        longitude: 126.97,
        permit: {
          type: "문의 필요",
          contactName: "Location office",
          contactPhone: "02-0000-0000",
          note: "Weekdays only",
          provenance: {
            source: "Location office notice",
            sourceUrl: "https://example.com/places/1/permit",
            referenceDate: "2026-09-01",
            lastVerifiedAt: "2026-09-21T09:30:00+09:00",
          },
        },
        parking: [{
          id: "parking-1",
          name: "Example public parking",
          latitude: 37.551,
          longitude: 126.971,
          capacity: 24,
          openingHours: "09:00-22:00",
          priceInfo: "Paid",
          provenance: {
            source: "City parking API",
            sourceUrl: "https://example.com/parking/1",
            referenceDate: "2026-09-02",
            lastVerifiedAt: "2026-09-22T10:00:00Z",
          },
        }],
        images: [
          { imagePath: "images/one.jpg", imageUrl: "https://example.com/one.jpg", alt: "Exterior" },
          { imagePath: "images/two.jpg", imageUrl: "https://example.com/two.jpg", alt: "Sample Warehouse" },
        ],
        sourceUrl: "https://example.com/places/1",
        provenance: {
          source: "Provider place catalog",
          sourceUrl: "https://example.com/places/1",
          referenceDate: "2026-09-01",
          lastVerifiedAt: "2026-09-20T00:00:00Z",
        },
      }],
      reviewQueue: [],
    });
  });

  it("uses safe defaults and accepts canonical category and region values", () => {
    const minimalMapping = parseSourceMapping({
      schemaVersion: 1,
      source: { name: "minimal", defaultSourceUrl: "https://example.com/license" },
      fields: {
        name: "name",
        category: "category",
        region: "region",
        address: "address",
        latitude: "latitude",
        longitude: "longitude",
      },
      images: { path: "images" },
    });

    expect(normalizeDataset([{
      name: "Riverside",
      category: "nature",
      region: "부산",
      address: "Example address",
      latitude: 35.1,
      longitude: 129.03,
      contactName: "Do not infer this field",
      contactPhone: "02-1111-2222",
      images: "https://example.com/riverside.jpg",
    }], minimalMapping).locations[0]).toMatchObject({
      description: "",
      permit: { type: "문의 필요", contactName: null, contactPhone: null, note: null },
      parking: [],
      images: [{ imageUrl: "https://example.com/riverside.jpg", alt: "Riverside" }],
      sourceUrl: "https://example.com/license",
      provenance: {
        source: "minimal",
        sourceUrl: "https://example.com/license",
        referenceDate: null,
        lastVerifiedAt: null,
      },
    });
  });

  it("rejects boolean permit decisions from a source", () => {
    expect(() => normalizeDataset({ payload: { places: [{
      title: "Unsafe permit value",
      kind: "warehouse",
      area: "Seoul",
      location: { address: "Address", lat: 37.5, lon: 127 },
      production: { permit: true },
      links: { source: "https://example.com/unsafe-permit" },
    }] } }, mapping)).toThrow("must not use an allowed/not-allowed boolean");
  });

  it("keeps unknown categories in a review queue without validating them as locations", () => {
    expect(normalizeDataset({ payload: { places: [{
      location_uuid: "provider-location-1",
      title: "Invalid",
      kind: "unknown",
    }] } }, mapping)).toEqual({
      schemaVersion: 2,
      source: { name: "licensed-source" },
      locations: [],
      reviewQueue: [{
        recordIndex: 0,
        sourceRecordId: "provider-location-1",
        name: "Invalid",
        sourceCategory: "unknown",
        normalizedSourceCategory: "unknown",
        reason: "UNKNOWN_CATEGORY",
      }],
    });
  });

  it("reports the raw record index when a non-category field is invalid", () => {
    expect(() => normalizeDataset({ payload: { places: [{
      title: "Invalid coordinate",
      details: { summary: "Bad latitude" },
      kind: "warehouse",
      area: "Seoul",
      location: { address: "Address", lat: 100, lon: 127 },
      links: { source: "https://example.com/invalid-coordinate" },
    }] } }, mapping)).toThrow("expected number to be <=90");
  });

  it("rejects empty input and ambiguous scalar-image mappings", () => {
    expect(() => normalizeDataset({ payload: { places: [] } }, mapping))
      .toThrow("at least one location");
    expect(() => parseSourceMapping({
      schemaVersion: 1,
      source: { name: "invalid", defaultSourceUrl: "https://example.com/source" },
      fields: {
        name: "name",
        category: "category",
        region: "region",
        address: "address",
        latitude: "latitude",
        longitude: "longitude",
      },
      images: { path: "images", alt: "caption" },
    })).toThrow("images.alt requires images.url");
  });

  it("rejects unsafe canonical permit defaults and mapping targets", () => {
    expect(() => parseSourceMapping({
      ...mapping,
      defaults: { ...mapping.defaults, permitType: "허가 가능" },
    })).toThrow();
    expect(() => parseSourceMapping({
      ...mapping,
      permitTypeMap: { allowed: "허가 가능" },
    })).toThrow();
  });
});
