import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  failedReportPath,
  parseValidateCliArgs,
  validateLocationFile,
} from "./validate.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function input(imagePath: string) {
  return {
    schemaVersion: 2,
    source: { name: "authorized-source" },
    locations: [{
      id: "00000000-0000-4000-8000-000000000101",
      name: "Location",
      description: "Description",
      category: "nature",
      region: "부산",
      address: "Address",
      latitude: 35.1,
      longitude: 129.03,
      permit: {
        type: "문의 필요",
        contactName: null,
        contactPhone: null,
        note: null,
        provenance: {
          source: "source",
          sourceUrl: "https://example.com/source",
          referenceDate: null,
          lastVerifiedAt: null,
        },
      },
      parking: [],
      images: [{ imagePath, imageUrl: "https://example.com/image.jpg", alt: "Location" }],
      sourceUrl: "https://example.com/source",
      provenance: {
        source: "source",
        sourceUrl: "https://example.com/source",
        referenceDate: null,
        lastVerifiedAt: null,
      },
    }],
  };
}

describe("location validation CLI", () => {
  it("requires an explicit validation mode and keeps mode-specific options separate", () => {
    expect(parseValidateCliArgs([
      "input.json",
      "report.json",
      "--require-local-assets",
      "--image-root",
      "images",
    ])).toEqual({
      inputPath: "input.json",
      reportPath: "report.json",
      mode: "require-local-assets",
      imageRoot: "images",
    });
    expect(parseValidateCliArgs([
      "input.json",
      "report.json",
      "--metadata-only",
      "--embedding-manifest",
      "embeddings.json",
      "--image-licenses",
      "licenses.json",
    ])).toEqual({
      inputPath: "input.json",
      reportPath: "report.json",
      mode: "metadata-only",
      embeddingManifestPath: "embeddings.json",
      imageLicensesPath: "licenses.json",
    });
    expect(() => parseValidateCliArgs(["input.json", "report.json"]))
      .toThrow("Validation mode is required");
    expect(() => parseValidateCliArgs(["input.json", "report.json", "--require-local-assets"]))
      .toThrow("--image-root");
    expect(() => parseValidateCliArgs([
      "input.json",
      "report.json",
      "--metadata-only",
      "--image-root",
      "images",
    ])).toThrow("only valid");
    expect(() => parseValidateCliArgs([
      "input.json",
      "report.json",
      "--metadata-only",
      "--image-licenses",
      "licenses.json",
    ])).toThrow("must be provided together");
  });

  it("writes a passing local-assets report with input identity and mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "scenescan-validation-"));
    temporaryDirectories.push(root);
    const inputPath = join(root, "normalized", "locations.json");
    const reportPath = join(root, "reports", "locations.json");
    const imageRoot = join(root, "images");
    await mkdir(join(root, "normalized"), { recursive: true });
    await mkdir(imageRoot, { recursive: true });
    await writeFile(join(imageRoot, "location.jpg"), "synthetic-test-image", "utf8");
    const inputText = JSON.stringify(input("location.jpg"));
    await writeFile(inputPath, inputText, "utf8");

    const result = await validateLocationFile({
      inputPath,
      reportPath,
      mode: "require-local-assets",
      imageRoot,
    });

    expect(result.outputPath).toBe(reportPath);
    expect(result.report.valid).toBe(true);
    expect(result.report.mode).toBe("require-local-assets");
    expect(result.report.input.locations.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.report.input.imageRoot).not.toBeNull();
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual(result.report);
    expect(await readFile(inputPath, "utf8")).toBe(inputText);
  });

  it("metadata-only succeeds when approved local bytes are absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "scenescan-validation-"));
    temporaryDirectories.push(root);
    const inputPath = join(root, "locations.json");
    const reportPath = join(root, "report.json");
    await writeFile(inputPath, JSON.stringify(input("missing.jpg")), "utf8");

    const result = await validateLocationFile({ inputPath, reportPath, mode: "metadata-only" });

    expect(result.report.valid).toBe(true);
    expect(result.report.errors).toEqual([]);
    expect(result.report.input.imageRoot).toBeNull();
  });

  it("writes a separate failure report and preserves the approved report", async () => {
    const root = await mkdtemp(join(tmpdir(), "scenescan-validation-"));
    temporaryDirectories.push(root);
    const inputPath = join(root, "locations.json");
    const reportPath = join(root, "validation-report.json");
    const approved = "{\"approved\":true}\n";
    await writeFile(inputPath, JSON.stringify(input("missing.jpg")), "utf8");
    await writeFile(reportPath, approved, "utf8");

    const result = await validateLocationFile({
      inputPath,
      reportPath,
      mode: "require-local-assets",
      imageRoot: root,
    });

    expect(result.report.valid).toBe(false);
    expect(result.report.errors.map((item) => item.code)).toContain("IMAGE_PATH_NOT_FOUND");
    expect(result.outputPath).toBe(failedReportPath(reportPath, "require-local-assets"));
    expect(await readFile(reportPath, "utf8")).toBe(approved);
    expect(JSON.parse(await readFile(result.outputPath, "utf8"))).toEqual(result.report);
    await expect(validateLocationFile({
      inputPath,
      reportPath: inputPath,
      mode: "metadata-only",
    })).rejects.toThrow("must not overwrite");
  });
});
