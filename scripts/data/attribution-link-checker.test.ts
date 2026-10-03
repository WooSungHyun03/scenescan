import { describe, expect, it, vi } from "vitest";
import { checkAttributionLinks, collectAttributionLinks } from "./attribution-link-checker.ts";
import type { ProductionRows } from "./production-importer.ts";

const locationId = "00000000-0000-4000-8000-000000000001";

function rows(): ProductionRows {
  return {
    locations: [{
      id: locationId,
      name: "장소",
      description: "설명",
      category: "urban",
      region: "서울",
      address: "주소",
      latitude: 37.5,
      longitude: 127,
      permit_type: "문의 필요",
      contact_name: null,
      contact_phone: null,
      permit_note: null,
      permit_source: "Official permit source",
      permit_source_url: "https://example.com/permit",
      permit_reference_date: null,
      permit_last_verified_at: "2026-10-02T00:00:00Z",
      noise_sources: [],
      source: "Wikidata",
      source_url: "https://www.wikidata.org/wiki/Q1",
      author: null,
      license: "CC0",
      license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
      last_verified_at: "2026-10-02T00:00:00Z",
    }],
    images: ["image-a", "image-b"].map((id) => ({
      id,
      location_id: locationId,
      image_url: `https://cdn.example.com/${id}.jpg`,
      alt: id,
      source: "Wikimedia Commons",
      source_url: "https://commons.wikimedia.org/wiki/File:Shared.jpg",
      author: "Author",
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0",
      last_verified_at: "2026-10-02T00:00:00Z",
    })),
  };
}

describe("attribution link checker", () => {
  it("checks duplicate URLs once while retaining every use", () => {
    const links = collectAttributionLinks(rows());
    const shared = links.find((link) => link.url.includes("Shared.jpg"));

    expect(links).toHaveLength(5);
    expect(links.find((link) => link.url.endsWith("/permit"))?.references[0].kind).toBe("permit-source");
    expect(shared?.references).toHaveLength(2);
    expect(shared?.references.map((reference) => reference.recordId)).toEqual(["image-a", "image-b"]);
  });

  it("separates broken links from access restrictions and network failures", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/gone")) return new Response(null, { status: 410 });
      if (url.endsWith("/blocked")) return new Response(null, { status: 429 });
      if (url.endsWith("/network")) throw new Error("network unavailable");
      return new Response(null, { status: 200 });
    });
    const links = ["ok", "gone", "blocked", "network"].map((suffix) => ({
      url: `https://example.com/${suffix}`,
      references: [{ kind: "location-source" as const, recordId: suffix, locationId }],
    }));

    const report = await checkAttributionLinks(links, {
      fetcher,
      checkedAt: "2026-10-03T00:00:00Z",
    });

    expect(report.summary).toEqual({ urls: 4, reachable: 1, broken: 1, unverified: 2 });
    expect(report.results.find((result) => result.url.endsWith("/gone"))?.status).toBe("broken");
    expect(report.results.find((result) => result.url.endsWith("/network"))?.error).toBe("network unavailable");
  });

  it("falls back to a range GET when a provider rejects HEAD", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => (
      init?.method === "HEAD"
        ? new Response(null, { status: 405 })
        : new Response(null, { status: 200 })
    ));
    const link = {
      url: "https://example.com/head-disabled",
      references: [{ kind: "image-source" as const, recordId: "image-a", locationId }],
    };

    const report = await checkAttributionLinks([link], { fetcher });

    expect(report.summary.reachable).toBe(1);
    expect(fetcher).toHaveBeenNthCalledWith(2, link.url, expect.objectContaining({
      method: "GET",
      headers: { Range: "bytes=0-0" },
    }));
  });

  it("confirms a HEAD 404 with GET before calling a link broken", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => (
      init?.method === "HEAD"
        ? new Response(null, { status: 404 })
        : new Response(null, { status: 200 })
    ));
    const link = {
      url: "https://example.com/get-only",
      references: [{ kind: "location-source" as const, recordId: locationId, locationId }],
    };

    const report = await checkAttributionLinks([link], { fetcher });

    expect(report.summary).toEqual({ urls: 1, reachable: 1, broken: 0, unverified: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
