import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { auditEmbeddingSchema, auditSimilarLocationSchema } from "./schema-audit.ts";

const DEFAULT_MIGRATIONS = "supabase/migrations";

async function readMigrationSql(path: string): Promise<string> {
  if ((await stat(path)).isFile()) return readFile(path, "utf8");
  const filenames = (await readdir(path)).filter((name) => name.endsWith(".sql")).sort();
  return (await Promise.all(filenames.map((name) => readFile(join(path, name), "utf8")))).join("\n");
}

export async function auditSchemaFile(path = DEFAULT_MIGRATIONS): Promise<number> {
  const sql = await readMigrationSql(path);
  return auditEmbeddingSchema(sql).checks.length + auditSimilarLocationSchema(sql).checks.length;
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? DEFAULT_MIGRATIONS;
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
