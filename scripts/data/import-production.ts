import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, readSupabaseAdminEnvironment } from "../shared/supabase-admin-client.ts";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import {
  createProductionRows,
  importProductionData,
  parseProductionEmbeddingManifest,
  parseImageLicenseCatalog,
  type ExistingImageMetadata,
  type ImageMetadataRow,
  type LocationRow,
  type ProductionImportDatabase,
  type ProductionImportMode,
  type ProductionWriteScope,
} from "./production-importer.ts";

type CliOptions = {
  locationsPath: string;
  manifestPath: string;
  imageLicensesPath: string;
  mode: ProductionImportMode;
  batchSize: number;
  preserveExisting: boolean;
  writeScope: ProductionWriteScope;
};

export function parseProductionImportArgs(args: string[]): CliOptions {
  const [locationsPath, manifestPath, ...flags] = args;
  if (!locationsPath || !manifestPath) {
    throw new Error("Usage: pnpm data:import-production <locations.json> <embeddings-manifest.json> [--image-licenses PATH] [--validate-only | --dry-run | --apply] [--batch-size N] [--insert-only | --attribution-only | --permit-only]");
  }
  let mode: ProductionImportMode = "validate-only";
  let selectedMode = false;
  let batchSize = 100;
  let preserveExisting = false;
  let writeScope: ProductionWriteScope = "all";
  let imageLicensesPath = resolve(dirname(locationsPath), "image-licenses.json");
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--validate-only" || flag === "--dry-run" || flag === "--apply") {
      if (selectedMode) throw new Error("Select exactly one import mode");
      selectedMode = true;
      mode = flag.slice(2) as ProductionImportMode;
    } else if (flag === "--insert-only") {
      preserveExisting = true;
    } else if (flag === "--attribution-only") {
      writeScope = "attribution-only";
    } else if (flag === "--permit-only") {
      writeScope = "permit-only";
    } else if (flag === "--batch-size") {
      batchSize = Number(flags[++index]);
    } else if (flag === "--image-licenses") {
      const path = flags[++index];
      if (!path) throw new Error("--image-licenses requires a path");
      imageLicensesPath = path;
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  if (preserveExisting && writeScope !== "all") {
    throw new Error("--insert-only cannot be combined with a partial write scope");
  }
  return { locationsPath, manifestPath, imageLicensesPath, mode, batchSize, preserveExisting, writeScope };
}

function failOnSupabaseError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export function createProductionImportDatabase(client: SupabaseClient): ProductionImportDatabase {
  const updateRows = async <T extends { id: string }>(
    table: "locations" | "location_images",
    rows: T[],
  ): Promise<void> => {
    const concurrency = 8;
    for (let index = 0; index < rows.length; index += concurrency) {
      await Promise.all(rows.slice(index, index + concurrency).map(async ({ id, ...attribution }) => {
        const { error, count } = await client
          .from(table)
          .update(attribution as Record<string, unknown>, { count: "exact" })
          .eq("id", id);
        failOnSupabaseError(error, `Unable to update ${table} attribution for ${id}`);
        if (count != null && count !== 1) {
          throw new Error(`Unable to update ${table} attribution for ${id}: expected one row, updated ${count}`);
        }
      }));
    }
  };

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
    async updateLocationAttribution(rows) {
      await updateRows("locations", rows);
    },
    async updateImageAttribution(rows) {
      await updateRows("location_images", rows);
    },
    async updatePermitMetadata(rows) {
      await updateRows("locations", rows);
    },
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const options = parseProductionImportArgs(process.argv.slice(2));
  const dataset = parseNormalizedLocationOutput(await readJson(options.locationsPath));
  const manifest = parseProductionEmbeddingManifest(await readJson(options.manifestPath));
  const imageLicenses = parseImageLicenseCatalog(await readJson(options.imageLicensesPath));
  const rows = createProductionRows(dataset, manifest, imageLicenses);
  let database: ProductionImportDatabase | undefined;
  if (options.mode !== "validate-only") {
    const environment = readSupabaseAdminEnvironment(process.env);
    const client = createSupabaseAdminClient(environment);
    database = createProductionImportDatabase(client);
  }
  const result = await importProductionData(
    rows,
    options.mode,
    options.batchSize,
    database,
    options.preserveExisting,
    options.writeScope,
  );
  console.log(
    `Production data import: mode=${result.mode}, scope=${result.writeScope}, locations=${result.locationsValidated}, images=${result.imagesValidated}, existing=${result.existingLocations}/${result.existingImages}, written=${result.locationsWritten}/${result.imagesWritten}`,
  );
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
