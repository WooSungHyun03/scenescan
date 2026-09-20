import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./prepare.ts";

describe("embedding CLI", () => {
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
