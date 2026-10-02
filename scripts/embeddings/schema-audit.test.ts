import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { auditAttributionSchema, auditEmbeddingSchema, auditSimilarLocationSchema } from "./schema-audit.ts";
import { auditSchemaFile } from "./audit-schema.ts";

const migration = new URL("../../supabase/migrations/20260920000000_initial_schema.sql", import.meta.url);
const similarMigration = new URL("../../supabase/migrations/20260928000000_similar_locations.sql", import.meta.url);
const scaleMigration = new URL("../../supabase/migrations/20260929000000_scale_location_catalog.sql", import.meta.url);
const attributionMigration = new URL("../../supabase/migrations/20261001000000_location_attribution.sql", import.meta.url);

describe("embedding database schema audit", () => {
  it("audits every committed migration by default", async () => {
    await expect(auditSchemaFile()).resolves.toBe(26);
  });

  it("passes the committed migration contract", async () => {
    const result = auditEmbeddingSchema(`${await readFile(migration, "utf8")}\n${await readFile(scaleMigration, "utf8")}`);
    expect(result.checks.length).toBeGreaterThanOrEqual(10);
    const similarResult = auditSimilarLocationSchema(await readFile(similarMigration, "utf8"));
    expect(similarResult.checks.length).toBeGreaterThanOrEqual(8);
    const attributionResult = auditAttributionSchema(await readFile(attributionMigration, "utf8"));
    expect(attributionResult.checks).toContain("image attribution columns");
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

  it("rejects attribution migrations that validate image constraints before adding them", async () => {
    const sql = await readFile(attributionMigration, "utf8");
    const addBlock = sql.match(/alter table public\.location_images\s+add constraint location_images_source_url_http_check[\s\S]*?not valid;/i)?.[0];
    const validateBlock = sql.match(/alter table public\.location_images\s+validate constraint location_images_source_url_http_check[\s\S]*?;/i)?.[0];
    expect(addBlock).toBeTruthy();
    expect(validateBlock).toBeTruthy();
    const invalid = sql
      .replace(addBlock!, "")
      .replace(validateBlock!, `${validateBlock}\n\n${addBlock}`);
    expect(() => auditAttributionSchema(invalid)).toThrow("must be added before validation");
  });
});
