import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createProductionImportDatabase, parseProductionImportArgs } from "./import-production.ts";

const execFileAsync = promisify(execFile);

describe("production import CLI", () => {
  it("parses attribution-only as a separate safe write scope", () => {
    expect(parseProductionImportArgs([
      "data/production/locations.json",
      "data/production/embeddings-manifest.json",
      "--dry-run",
      "--attribution-only",
    ])).toMatchObject({
      mode: "dry-run",
      preserveExisting: false,
      writeScope: "attribution-only",
    });
    expect(() => parseProductionImportArgs([
      "locations.json",
      "manifest.json",
      "--apply",
      "--insert-only",
      "--attribution-only",
    ])).toThrow("cannot be combined");
  });

  it("parses permit-only as a separate safe write scope", () => {
    expect(parseProductionImportArgs([
      "data/production/locations.json",
      "data/production/embeddings-manifest.json",
      "--dry-run",
      "--permit-only",
    ])).toMatchObject({
      mode: "dry-run",
      preserveExisting: false,
      writeScope: "permit-only",
    });
  });

  it("runs the documented validate-only command in plain Node", async () => {
    const locations = JSON.parse(await readFile("data/production/locations.json", "utf8")) as {
      locations: unknown[];
    };
    const manifest = JSON.parse(await readFile("data/production/embeddings-manifest.json", "utf8")) as {
      items: unknown[];
    };
    const { stdout } = await execFileAsync(process.execPath, [
      "--experimental-strip-types",
      "scripts/data/import-production.ts",
      "data/production/locations.json",
      "data/production/embeddings-manifest.json",
      "--validate-only",
    ], { cwd: process.cwd(), timeout: 30_000 });

    expect(stdout).toContain("mode=validate-only");
    expect(stdout).toContain(`locations=${locations.locations.length}, images=${manifest.items.length}`);
  });

  it("sends only attribution columns to partial database updates", async () => {
    const locationEq = vi.fn(async () => ({ error: null }));
    const imageEq = vi.fn(async () => ({ error: null }));
    const locationUpdate = vi.fn(() => ({ eq: locationEq }));
    const imageUpdate = vi.fn(() => ({ eq: imageEq }));
    const client = {
      from: vi.fn((table: string) => ({
        update: table === "locations" ? locationUpdate : imageUpdate,
      })),
    } as unknown as SupabaseClient;
    const database = createProductionImportDatabase(client);

    await database.updateLocationAttribution([{
      id: "00000000-0000-4000-8000-000000000001",
      source: "Wikidata (CC0)",
      source_url: "https://www.wikidata.org/wiki/Q1",
      author: null,
      license: "CC0",
      license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
      last_verified_at: "2026-10-02T00:00:00Z",
    }]);
    await database.updateImageAttribution([{
      id: "00000000-0000-4000-8000-000000000002",
      source: "Wikimedia Commons",
      source_url: "https://commons.wikimedia.org/wiki/File:Test.jpg",
      author: "Author",
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0",
      last_verified_at: "2026-10-02T00:00:00Z",
    }]);
    await database.updatePermitMetadata([{
      id: "00000000-0000-4000-8000-000000000001",
      permit_type: "기관 직접 문의",
      contact_name: "Official desk",
      contact_phone: "02-1234-5678",
      permit_note: "Check current conditions",
      permit_source: "Official guide",
      permit_source_url: "https://example.com/permit",
      permit_reference_date: "2026-01-01",
      permit_last_verified_at: "2026-10-03T00:00:00Z",
    }]);

    expect(locationUpdate).toHaveBeenCalledWith({
      source: "Wikidata (CC0)",
      source_url: "https://www.wikidata.org/wiki/Q1",
      author: null,
      license: "CC0",
      license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
      last_verified_at: "2026-10-02T00:00:00Z",
    }, { count: "exact" });
    expect(imageUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({ image_url: expect.anything() }),
      { count: "exact" },
    );
    expect(locationUpdate).toHaveBeenCalledWith({
      permit_type: "기관 직접 문의",
      contact_name: "Official desk",
      contact_phone: "02-1234-5678",
      permit_note: "Check current conditions",
      permit_source: "Official guide",
      permit_source_url: "https://example.com/permit",
      permit_reference_date: "2026-01-01",
      permit_last_verified_at: "2026-10-03T00:00:00Z",
    }, { count: "exact" });
    expect(locationEq).toHaveBeenCalledWith("id", "00000000-0000-4000-8000-000000000001");
    expect(imageEq).toHaveBeenCalledWith("id", "00000000-0000-4000-8000-000000000002");
  });
});
