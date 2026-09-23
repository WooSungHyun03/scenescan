import { describe, expect, it } from "vitest";
import { parseSourceMapping } from "./contracts.ts";
import { normalizeDataset } from "./normalizer.ts";

const mapping = parseSourceMapping({
  schemaVersion: 1,
  source: { name: "licensed-source", defaultSourceUrl: "https://example.com/license" },
  recordsPath: "payload.places",
  fields: {
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
  images: { path: "media.images", url: "url", alt: "caption" },
  categoryMap: { warehouse: "industrial" },
  regionMap: { Seoul: "서울" },
  defaults: { description: "", permitType: "정보 확인 필요" },
});

describe("normalizeDataset", () => {
  it("maps a provider-specific record into the canonical SceneScan fields", () => {
    const output = normalizeDataset({
      payload: {
        places: [{
          title: "  Sample Warehouse  ",
          details: { summary: "  Licensed sample  " },
          kind: "warehouse",
          area: "Seoul",
          location: { address: " 1 Example-ro ", lat: "37.55", lon: 126.97 },
          production: {
            permit: "Contact first",
            contact: { name: "Location office", phone: "02-0000-0000" },
            note: "Weekdays only",
          },
          media: { images: [
            { url: "https://example.com/one.jpg", caption: "Exterior" },
            { url: "https://example.com/two.jpg", caption: "" },
          ] },
          links: { source: "https://example.com/places/1" },
        }],
      },
    }, mapping);

    expect(output).toEqual({
      schemaVersion: 1,
      source: { name: "licensed-source" },
      locations: [{
        name: "Sample Warehouse",
        description: "Licensed sample",
        category: "industrial",
        region: "서울",
        address: "1 Example-ro",
        latitude: 37.55,
        longitude: 126.97,
        permit: {
          type: "Contact first",
          contactName: "Location office",
          contactPhone: "02-0000-0000",
          note: "Weekdays only",
        },
        images: [
          { imageUrl: "https://example.com/one.jpg", alt: "Exterior" },
          { imageUrl: "https://example.com/two.jpg", alt: "Sample Warehouse" },
        ],
        sourceUrl: "https://example.com/places/1",
      }],
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
      images: "https://example.com/riverside.jpg",
    }], minimalMapping).locations[0]).toMatchObject({
      description: "",
      permit: { type: "정보 확인 필요", contactName: null, contactPhone: null, note: null },
      images: [{ imageUrl: "https://example.com/riverside.jpg", alt: "Riverside" }],
      sourceUrl: "https://example.com/license",
    });
  });

  it("reports the raw record index when a mapped value or coordinate is invalid", () => {
    expect(() => normalizeDataset({ payload: { places: [{
      title: "Invalid",
      details: { summary: "Bad category" },
      kind: "unknown",
      area: "Seoul",
      location: { address: "Address", lat: 37.5, lon: 127 },
      links: { source: "https://example.com/invalid" },
    }] } }, mapping)).toThrow("raw record 0");

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
});
