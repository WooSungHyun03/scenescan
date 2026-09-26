import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseValidateCliArgs, validateLocationFile } from "./validate.ts";

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
  it("parses an optional image root and rejects unknown options", () => {
    expect(parseValidateCliArgs(["input.json", "report.json", "--image-root", "images"]))
      .toEqual({ inputPath: "input.json", reportPath: "report.json", imageRoot: "images" });
    expect(() => parseValidateCliArgs(["input.json", "report.json", "--unknown"]))
      .toThrow("Unknown option");
  });

  it("writes a passing report when every local image file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "scenescan-validation-"));
    temporaryDirectories.push(root);
    const inputPath = join(root, "normalized", "locations.json");
    const reportPath = join(root, "reports", "locations.json");
    const imagePath = join(root, "images", "location.jpg");
    await mkdir(join(root, "normalized"), { recursive: true });
    await mkdir(join(root, "images"), { recursive: true });
    await writeFile(imagePath, "synthetic-test-image", "utf8");
    const inputText = JSON.stringify(input("location.jpg"));
    await writeFile(inputPath, inputText, "utf8");

    const report = await validateLocationFile({ inputPath, reportPath, imageRoot: join(root, "images") });

    expect(report.valid).toBe(true);
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual(report);
    expect(await readFile(inputPath, "utf8")).toBe(inputText);
  });

  it("writes a failure report for a missing image and refuses to overwrite input", async () => {
    const root = await mkdtemp(join(tmpdir(), "scenescan-validation-"));
    temporaryDirectories.push(root);
    const inputPath = join(root, "locations.json");
    const reportPath = join(root, "report.json");
    await writeFile(inputPath, JSON.stringify(input("missing.jpg")), "utf8");

    const report = await validateLocationFile({ inputPath, reportPath });

    expect(report.valid).toBe(false);
    expect(report.errors.map((item) => item.code)).toContain("IMAGE_PATH_NOT_FOUND");
    await expect(validateLocationFile({ inputPath, reportPath: inputPath }))
      .rejects.toThrow("must not overwrite");
  });
});
