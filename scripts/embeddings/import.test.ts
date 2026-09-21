import { describe, expect, it } from "vitest";
import { parseImportCliArgs, readDatabaseEnvironment } from "./import.ts";

describe("embedding import CLI", () => {
  it("defaults to offline validation and parses explicit modes", () => {
    expect(parseImportCliArgs(["output.json"])).toEqual({ outputPath: "output.json", mode: "validate-only", batchSize: 100 });
    expect(parseImportCliArgs(["output.json", "--dry-run", "--batch-size", "25"])).toEqual({
      outputPath: "output.json", mode: "dry-run", batchSize: 25,
    });
    expect(() => parseImportCliArgs(["output.json", "--dry-run", "--apply"])).toThrow("exactly one");
  });

  it("keeps service-role credentials server-only and requires HTTPS remotely", () => {
    expect(() => readDatabaseEnvironment({ NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "secret" })).toThrow("NEXT_PUBLIC");
    expect(() => readDatabaseEnvironment({ SUPABASE_URL: "https://project.supabase.co" })).toThrow("required");
    expect(() => readDatabaseEnvironment({ SUPABASE_URL: "http://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" }))
      .toThrow("HTTPS");
    expect(readDatabaseEnvironment({ SUPABASE_URL: "http://localhost:54321", SUPABASE_SERVICE_ROLE_KEY: "secret" }))
      .toEqual({ url: "http://localhost:54321", serviceRoleKey: "secret" });
  });
});
