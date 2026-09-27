import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { auditEmbeddingSchema, auditSimilarLocationSchema } from "./schema-audit.ts";
import { auditSchemaFile } from "./audit-schema.ts";

const migration = new URL("../../supabase/migrations/20260920000000_initial_schema.sql", import.meta.url);
const similarMigration = new URL("../../supabase/migrations/20260928000000_similar_locations.sql", import.meta.url);

describe("embedding database schema audit", () => {
  it("audits every committed migration by default", async () => {
    await expect(auditSchemaFile()).resolves.toBe(20);
  });

  it("passes the committed migration contract", async () => {
    const result = auditEmbeddingSchema(await readFile(migration, "utf8"));
    expect(result.checks.length).toBeGreaterThanOrEqual(10);
    const similarResult = auditSimilarLocationSchema(await readFile(similarMigration, "utf8"));
    expect(similarResult.checks.length).toBeGreaterThanOrEqual(8);
  });

  it("reports missing contract elements", async () => {
    const sql = (await readFile(migration, "utf8")).replace("extensions.vector(512)", "text");
    expect(() => auditEmbeddingSchema(sql)).toThrow("location image vector(512)");
  });

  it("reports missing similar-location contract elements", async () => {
    const sql = (await readFile(similarMigration, "utf8"))
      .replace("li.location_id <> source_location_id", "true");
    expect(() => auditSimilarLocationSchema(sql)).toThrow("selected location exclusion");
  });
});
