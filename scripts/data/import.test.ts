import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseImportCliArgs, runImport } from "./import.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function location(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    name: "테스트 장소",
    description: "설명",
    category: "nature",
    region: "부산",
    address: "주소",
    latitude: 35.1,
    longitude: 129.03,
    permit: { type: "문의 필요", contactName: null, contactPhone: null, note: null, provenance: provenance() },
    parking: [],
    images: [{ imagePath: "location.jpg", imageUrl: "https://example.com/image.jpg", alt: "설명" }],
    sourceUrl: "https://example.com/source",
    provenance: provenance(),
    ...overrides,
  };
}

function provenance() {
  return { source: "source", sourceUrl: "https://example.com/source", referenceDate: null, lastVerifiedAt: null };
}

function datasetWith(locations: unknown[]) {
  return { schemaVersion: 2, source: { name: "authorized-source" }, locations };
}

async function makeWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "scenescan-import-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "images"), { recursive: true });
  await writeFile(join(root, "images", "location.jpg"), "synthetic-test-image", "utf8");
  return root;
}

describe("location import CLI arg parsing", () => {
  it("defaults to validate-only and parses explicit modes/options", () => {
    expect(parseImportCliArgs(["input.json", "report.json"])).toEqual({
      inputPath: "input.json", reportPath: "report.json", mode: "validate-only", batchSize: 100,
    });
    expect(parseImportCliArgs(["input.json", "report.json", "--dry-run", "--batch-size", "25", "--image-root", "images"])).toEqual({
      inputPath: "input.json", reportPath: "report.json", mode: "dry-run", batchSize: 25, imageRoot: "images",
    });
    expect(() => parseImportCliArgs(["input.json", "report.json", "--dry-run", "--apply"])).toThrow("exactly one");
    expect(() => parseImportCliArgs(["input.json", "report.json", "--unknown"])).toThrow("Unknown option");
  });
});

describe("location import CLI (validate-only, no database needed)", () => {
  it("writes a validation report and imports nothing when everything is valid", async () => {
    const root = await makeWorkspace();
    const inputPath = join(root, "input.json");
    const reportPath = join(root, "report.json");
    await writeFile(inputPath, JSON.stringify(datasetWith([location()])), "utf8");

    await runImport({ inputPath, reportPath, mode: "validate-only", batchSize: 100, imageRoot: join(root, "images") });

    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(report.valid).toBe(true);
    expect(process.exitCode).not.toBe(1);
  });

  it("skips an invalid record (bad region), reports why, and still processes the valid ones", async () => {
    const root = await makeWorkspace();
    const inputPath = join(root, "input.json");
    const reportPath = join(root, "report.json");
    await writeFile(inputPath, JSON.stringify(datasetWith([
      location(),
      location({ id: "00000000-0000-4000-8000-000000000102", region: "제주" }),
    ])), "utf8");

    await runImport({ inputPath, reportPath, mode: "validate-only", batchSize: 100, imageRoot: join(root, "images") });

    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(report.valid).toBe(false);
    expect(report.errors.some((error: { code: string; locationIndex: number | null }) => error.code === "REGION_UNKNOWN" && error.locationIndex === 1)).toBe(true);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("refuses to overwrite the input file with the report", async () => {
    const root = await makeWorkspace();
    const inputPath = join(root, "input.json");
    await writeFile(inputPath, JSON.stringify(datasetWith([location()])), "utf8");
    await expect(runImport({ inputPath, reportPath: inputPath, mode: "validate-only", batchSize: 100 }))
      .rejects.toThrow("must not overwrite");
  });
});
