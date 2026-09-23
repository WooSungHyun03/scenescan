import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeLocationFile, parseNormalizeCliArgs } from "./normalize.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("location normalization CLI", () => {
  it("requires separate raw, mapping, and output paths", () => {
    expect(parseNormalizeCliArgs(["raw.json", "mapping.json", "output.json"]))
      .toEqual({ rawPath: "raw.json", mappingPath: "mapping.json", outputPath: "output.json" });
    expect(() => parseNormalizeCliArgs(["raw.json", "output.json"])).toThrow("Usage");
  });

  it("preserves the raw file and writes normalized output to a different directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "scenescan-data-"));
    temporaryDirectories.push(root);
    const rawPath = join(root, "raw", "provider.json");
    const mappingPath = join(root, "mapping.json");
    const outputPath = join(root, "normalized", "provider.json");
    const rawText = JSON.stringify([{
      name: "Location",
      category: "urban",
      region: "서울",
      address: "Address",
      latitude: 37.5,
      longitude: 127,
    }]);
    await mkdir(join(root, "raw"), { recursive: true });
    await writeFile(rawPath, rawText, "utf8");
    await writeFile(mappingPath, JSON.stringify({
      schemaVersion: 1,
      source: { name: "source", defaultSourceUrl: "https://example.com/source" },
      fields: {
        name: "name",
        category: "category",
        region: "region",
        address: "address",
        latitude: "latitude",
        longitude: "longitude",
      },
    }), "utf8");

    const output = await normalizeLocationFile({ rawPath, mappingPath, outputPath });

    expect(output.locations).toHaveLength(1);
    expect(await readFile(rawPath, "utf8")).toBe(rawText);
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(output);
  });

  it("refuses to overwrite the raw source", async () => {
    await expect(normalizeLocationFile({
      rawPath: "same.json",
      mappingPath: "mapping.json",
      outputPath: "same.json",
    })).rejects.toThrow("must not overwrite the raw source");
  });
});
