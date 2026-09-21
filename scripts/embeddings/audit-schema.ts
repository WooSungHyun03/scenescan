import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { auditEmbeddingSchema } from "./schema-audit.ts";

const DEFAULT_MIGRATION = "supabase/migrations/20260920000000_initial_schema.sql";

export async function auditSchemaFile(path = DEFAULT_MIGRATION): Promise<number> {
  const result = auditEmbeddingSchema(await readFile(path, "utf8"));
  return result.checks.length;
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? DEFAULT_MIGRATION;
  const count = await auditSchemaFile(path);
  console.log(`Embedding schema audit passed: ${count} checks (${path})`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
