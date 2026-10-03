import { describe, expect, it } from "vitest";
import { extractIndividually, parseCliArgs } from "./prepare.ts";

describe("embedding CLI", () => {
  it("extracts each image separately to match browser q8 activation ranges", async () => {
    const seen: unknown[] = [];
    const values = await extractIndividually(async (image) => { seen.push(image); return { data: [seen.length, 0.5] }; }, ["first", "second"]);
    expect(seen).toEqual(["first", "second"]);
    expect(values).toEqual([1, 0.5, 2, 0.5]);
  });
  it("uses safe resume defaults", () => {
    expect(parseCliArgs(["manifest.json", "output.json"])).toEqual({
      manifestPath: "manifest.json",
      outputPath: "output.json",
      batchSize: 8,
      retries: 1,
      resume: true,
    });
  });

  it("parses batch, retry, and clean-run flags", () => {
    expect(parseCliArgs([
      "manifest.json",
      "output.json",
      "--batch-size",
      "16",
      "--retries",
      "2",
      "--no-resume",
    ])).toMatchObject({ batchSize: 16, retries: 2, resume: false });
  });

  it("rejects missing paths and unknown options", () => {
    expect(() => parseCliArgs([])).toThrow("Usage");
    expect(() => parseCliArgs(["in.json", "out.json", "--unknown"])).toThrow("Unknown option");
  });
});
