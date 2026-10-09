import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import {
  buildNonBusanCleanupManifest,
  parseNonBusanCleanupArgs,
  runNonBusanCleanup,
  type NonBusanCleanupDatabase,
} from "./non-busan-cleanup.ts";

const execFileAsync = promisify(execFile);

function provenance() {
  return { source: "s", sourceUrl: "https://example.com", referenceDate: null, lastVerifiedAt: null };
}

function location(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "장소",
    description: "설명",
    category: "urban",
    region: "서울",
    address: "주소",
    latitude: 37.5,
    longitude: 127,
    permit: { type: "문의 필요", contactName: null, contactPhone: null, note: null, provenance: provenance() },
    parking: [],
    images: [{ imageUrl: "https://example.com/a.jpg", alt: "설명" }],
    sourceUrl: "https://example.com/source",
    provenance: provenance(),
    ...overrides,
  };
}

function dataset(locations: unknown[]) {
  return parseNormalizedLocationOutput({ schemaVersion: 2, source: { name: "test" }, locations });
}

describe("buildNonBusanCleanupManifest", () => {
  it("plans every non-Busan location for deletion and leaves Busan locations out", () => {
    const data = dataset([
      location({ id: "00000000-0000-4000-8000-000000000001", name: "서울 장소", region: "서울" }),
      location({ id: "00000000-0000-4000-8000-000000000002", name: "부산 장소", region: "부산", district: "busan_haeundae_gu" }),
    ]);
    const manifest = buildNonBusanCleanupManifest(data, "2026-10-09T00:00:00Z");
    expect(manifest.totalLocations).toBe(2);
    expect(manifest.busanLocations).toBe(1);
    expect(manifest.nonBusanLocations).toBe(1);
    expect(manifest.candidates).toEqual([
      { id: "00000000-0000-4000-8000-000000000001", name: "서울 장소", region: "서울", imageCount: 1 },
    ]);
  });

  it("produces an empty candidate list when every location is already Busan", () => {
    const data = dataset([location({ region: "부산", district: "busan_haeundae_gu" })]);
    const manifest = buildNonBusanCleanupManifest(data, "2026-10-09T00:00:00Z");
    expect(manifest.candidates).toEqual([]);
    expect(manifest.nonBusanLocations).toBe(0);
  });
});

describe("parseNonBusanCleanupArgs", () => {
  it("defaults to no apply/confirmation when only the two required paths are given", () => {
    expect(parseNonBusanCleanupArgs(["locations.json", "out.json"])).toMatchObject({ apply: false, confirmedDelete: false });
  });

  it("requires both paths", () => {
    expect(() => parseNonBusanCleanupArgs(["only-one.json"])).toThrow();
  });

  it("rejects an unknown flag", () => {
    expect(() => parseNonBusanCleanupArgs(["a.json", "b.json", "--delete-everything"])).toThrow();
  });
});

describe("runNonBusanCleanup", () => {
  function manifest(candidateCount: number) {
    return {
      schemaVersion: 1 as const,
      generatedAt: "2026-10-09T00:00:00Z",
      reason: "test",
      totalLocations: candidateCount,
      busanLocations: 0,
      nonBusanLocations: candidateCount,
      candidates: Array.from({ length: candidateCount }, (_, index) => ({
        id: `id-${index}`, name: `장소${index}`, region: "서울", imageCount: 1,
      })),
    };
  }

  it("plan mode never touches the database, even when one is provided", async () => {
    const database: NonBusanCleanupDatabase = {
      deleteParkingForLocations: vi.fn(async () => { throw new Error("must never be called"); }),
      deleteLocations: vi.fn(async () => { throw new Error("must never be called"); }),
    };
    const result = await runNonBusanCleanup(manifest(2), "plan", database);
    expect(result).toEqual({ mode: "plan", candidateCount: 2, locationsDeleted: 0 });
    expect(database.deleteParkingForLocations).not.toHaveBeenCalled();
    expect(database.deleteLocations).not.toHaveBeenCalled();
  });

  it("plan mode works without a database argument at all", async () => {
    const result = await runNonBusanCleanup(manifest(3), "plan");
    expect(result).toEqual({ mode: "plan", candidateCount: 3, locationsDeleted: 0 });
  });

  it("apply mode requires a database connection", async () => {
    await expect(runNonBusanCleanup(manifest(1), "apply")).rejects.toThrow(/database connection/i);
  });

  it("apply mode deletes parking before locations, for exactly the candidate ids", async () => {
    const calls: string[] = [];
    const database: NonBusanCleanupDatabase = {
      deleteParkingForLocations: vi.fn(async (ids) => { calls.push(`parking:${ids.join(",")}`); }),
      deleteLocations: vi.fn(async (ids) => { calls.push(`locations:${ids.join(",")}`); }),
    };
    const result = await runNonBusanCleanup(manifest(2), "apply", database);
    expect(result).toEqual({ mode: "apply", candidateCount: 2, locationsDeleted: 2 });
    expect(calls).toEqual(["parking:id-0,id-1", "locations:id-0,id-1"]);
  });

  it("apply mode is a no-op when there are no candidates", async () => {
    const database: NonBusanCleanupDatabase = {
      deleteParkingForLocations: vi.fn(async () => {}),
      deleteLocations: vi.fn(async () => {}),
    };
    const result = await runNonBusanCleanup(manifest(0), "apply", database);
    expect(result).toEqual({ mode: "apply", candidateCount: 0, locationsDeleted: 0 });
    expect(database.deleteParkingForLocations).not.toHaveBeenCalled();
    expect(database.deleteLocations).not.toHaveBeenCalled();
  });
});

describe("non-busan cleanup CLI", () => {
  const temporaryDirectories: string[] = [];
  afterEach(async () => {
    for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
  });

  it("defaults to a dry-run plan against the real production catalog, with no Supabase credentials set", async () => {
    const directory = await mkdtemp(join(tmpdir(), "scenescan-non-busan-cleanup-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "plan.json");

    const { stdout } = await execFileAsync(process.execPath, [
      "--experimental-strip-types",
      "scripts/data/non-busan-cleanup.ts",
      "data/production/locations.json",
      outputPath,
    ], {
      cwd: process.cwd(),
      timeout: 30_000,
      // Explicitly unset any ambient Supabase admin credentials so this
      // proves the default path never needs or uses them.
      env: { ...process.env, SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
    });

    expect(stdout).toContain("Dry-run only (default)");
    const manifest = JSON.parse(await readFile(outputPath, "utf8")) as { nonBusanLocations: number; busanLocations: number };
    const catalog = JSON.parse(await readFile("data/production/locations.json", "utf8")) as { locations: Array<{ region: string }> };
    expect(manifest.busanLocations).toBe(catalog.locations.filter((location) => location.region === "부산").length);
    expect(manifest.nonBusanLocations).toBe(catalog.locations.filter((location) => location.region !== "부산").length);
  });

  it("refuses to delete anything when only one of the two required flags is given", async () => {
    const directory = await mkdtemp(join(tmpdir(), "scenescan-non-busan-cleanup-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "plan.json");

    await expect(execFileAsync(process.execPath, [
      "--experimental-strip-types",
      "scripts/data/non-busan-cleanup.ts",
      "data/production/locations.json",
      outputPath,
      "--apply",
    ], { cwd: process.cwd(), timeout: 30_000 })).rejects.toThrow();
  });
});
