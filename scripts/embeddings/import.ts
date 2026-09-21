import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseOutput } from "./contracts.ts";
import {
  importEmbeddings,
  type EmbeddingImportDatabase,
  type ExistingImage,
  type ImportMode,
  type ImportRow,
  type RpcProbeRow,
} from "./importer.ts";

export type ImportCliOptions = {
  outputPath: string;
  mode: ImportMode;
  batchSize: number;
};

export function parseImportCliArgs(args: string[]): ImportCliOptions {
  const [outputPath, ...flags] = args;
  if (!outputPath) {
    throw new Error("Usage: pnpm embeddings:import <output.json> [--validate-only | --dry-run | --apply] [--batch-size N]");
  }
  let mode: ImportMode = "validate-only";
  let selectedMode = false;
  let batchSize = 100;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--validate-only" || flag === "--dry-run" || flag === "--apply") {
      if (selectedMode) throw new Error("Select exactly one import mode");
      selectedMode = true;
      mode = flag.slice(2) as ImportMode;
    } else if (flag === "--batch-size") {
      batchSize = Number(flags[++index]);
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return { outputPath, mode, batchSize };
}

export type DatabaseEnvironment = { url: string; serviceRoleKey: string };

export function readDatabaseEnvironment(env: Readonly<Record<string, string | undefined>>): DatabaseEnvironment {
  if (env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Service role credentials must never use a NEXT_PUBLIC_ environment variable");
  }
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for dry-run/apply");
  }
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
    throw new Error("SUPABASE_URL must use HTTPS unless it targets localhost");
  }
  return { url, serviceRoleKey };
}

function failOnSupabaseError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export function createSupabaseImportDatabase(client: SupabaseClient): EmbeddingImportDatabase {
  return {
    async findLocationIds(ids) {
      const { data, error } = await client.from("locations").select("id").in("id", ids);
      failOnSupabaseError(error, "Unable to verify locations");
      return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    },
    async findExistingImages(ids) {
      const { data, error } = await client.from("location_images").select("id, location_id").in("id", ids);
      failOnSupabaseError(error, "Unable to verify existing location images");
      return (data ?? []) as ExistingImage[];
    },
    async probeRpc(embedding) {
      const { data, error } = await client.rpc("match_location_images", {
        query_embedding: embedding,
        match_threshold: 1,
        match_count: 1,
      });
      failOnSupabaseError(error, "Unable to probe match_location_images RPC");
      return (data ?? []) as RpcProbeRow[];
    },
    async upsertImages(rows: ImportRow[]) {
      const { error } = await client.from("location_images").upsert(rows, { onConflict: "id" });
      failOnSupabaseError(error, "Unable to upsert location images");
    },
  };
}

async function main(): Promise<void> {
  const options = parseImportCliArgs(process.argv.slice(2));
  const output = parseOutput(JSON.parse(await readFile(options.outputPath, "utf8")) as unknown);
  let database: EmbeddingImportDatabase | undefined;
  if (options.mode !== "validate-only") {
    const environment = readDatabaseEnvironment(process.env);
    const client = createClient(environment.url, environment.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    database = createSupabaseImportDatabase(client);
  }
  const result = await importEmbeddings(output, options.mode, options.batchSize, database);
  console.log(`Embedding import: mode=${result.mode}, validated=${result.validated}, existing=${result.existing}, written=${result.written}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
