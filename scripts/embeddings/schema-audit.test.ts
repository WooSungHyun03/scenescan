import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { auditEmbeddingSchema } from "./schema-audit.ts";

const migration = new URL("../../supabase/migrations/20260920000000_initial_schema.sql", import.meta.url);

describe("embedding database schema audit", () => {
  it("passes the committed migration contract", async () => {
    const result = auditEmbeddingSchema(await readFile(migration, "utf8"));
    expect(result.checks.length).toBeGreaterThanOrEqual(10);
  });

  it("reports missing contract elements", async () => {
    const sql = (await readFile(migration, "utf8")).replace("extensions.vector(512)", "text");
    expect(() => auditEmbeddingSchema(sql)).toThrow("location image vector(512)");
  });
});
