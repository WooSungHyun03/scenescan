import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseManifest } from "../embeddings/contracts.ts";
import { readDatabaseEnvironment } from "../embeddings/import.ts";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import {
  createProductionRows,
  importProductionData,
  type ExistingImageMetadata,
  type ImageMetadataRow,
  type LocationRow,
  type ProductionImportDatabase,
  type ProductionImportMode,
} from "./production-importer.ts";

type CliOptions = {
  locationsPath: string;
  manifestPath: string;
  mode: ProductionImportMode;
  batchSize: number;
};

export function parseProductionImportArgs(args: string[]): CliOptions {
  const [locationsPath, manifestPath, ...flags] = args;
  if (!locationsPath || !manifestPath) {
    throw new Error("Usage: pnpm data:import-production <locations.json> <embeddings-manifest.json> [--validate-only | --dry-run | --apply] [--batch-size N]");
  }
  let mode: ProductionImportMode = "validate-only";
  let selectedMode = false;
  let batchSize = 100;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--validate-only" || flag === "--dry-run" || flag === "--apply") {
      if (selectedMode) throw new Error("Select exactly one import mode");
      selectedMode = true;
      mode = flag.slice(2) as ProductionImportMode;
    } else if (flag === "--batch-size") {
      batchSize = Number(flags[++index]);
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return { locationsPath, manifestPath, mode, batchSize };
}

function failOnSupabaseError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export function createProductionImportDatabase(client: SupabaseClient): ProductionImportDatabase {
  return {
    async findLocationIds(ids) {
      const { data, error } = await client.from("locations").select("id").in("id", ids);
      failOnSupabaseError(error, "Unable to inspect locations");
      return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    },
    async findExistingImages(ids) {
      const { data, error } = await client.from("location_images").select("id, location_id").in("id", ids);
      failOnSupabaseError(error, "Unable to inspect location images");
      return (data ?? []) as ExistingImageMetadata[];
    },
    async upsertLocations(rows: LocationRow[]) {
      const { error } = await client.from("locations").upsert(rows, { onConflict: "id" });
      failOnSupabaseError(error, "Unable to upsert locations");
    },
    async upsertImages(rows: ImageMetadataRow[]) {
      const { error } = await client.from("location_images").upsert(rows, { onConflict: "id" });
      failOnSupabaseError(error, "Unable to upsert image metadata");
    },
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const options = parseProductionImportArgs(process.argv.slice(2));
  const dataset = parseNormalizedLocationOutput(await readJson(options.locationsPath));
  const manifest = parseManifest(await readJson(options.manifestPath));
  const rows = createProductionRows(dataset, manifest);
  let database: ProductionImportDatabase | undefined;
  if (options.mode !== "validate-only") {
    const environment = readDatabaseEnvironment(process.env);
    const client = createClient(environment.url, environment.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    database = createProductionImportDatabase(client);
  }
  const result = await importProductionData(rows, options.mode, options.batchSize, database);
  console.log(
    `Production data import: mode=${result.mode}, locations=${result.locationsValidated}, images=${result.imagesValidated}, existing=${result.existingLocations}/${result.existingImages}, written=${result.locationsWritten}/${result.imagesWritten}`,
  );
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
