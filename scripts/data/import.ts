import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, readSupabaseAdminEnvironment } from "../shared/supabase-admin-client.ts";
import type { CanonicalLocationRecord } from "./contracts.ts";
import {
  importLocationDataset,
  type ExistingParkingKey,
  type ImportMode,
  type LocationImportDatabase,
  type LocationRow,
  type ParkingRow,
} from "./location-importer.ts";
import { validateLocationDataset, type DataValidationReport, type ImagePathStatus } from "./validator.ts";

// Locations and parking only. location_images and embeddings are Member 1's
// scripts/embeddings pipeline (scripts/embeddings/prepare.ts +
// scripts/embeddings/import.ts) -- not duplicated here. Run this importer
// FIRST: location_images.location_id is a foreign key to locations.id, so
// scripts/embeddings/import.ts's "Missing location_id values" preflight
// check needs the location rows to already exist.

export type ImportCliOptions = {
  inputPath: string;
  reportPath: string;
  mode: ImportMode;
  batchSize: number;
  imageRoot?: string;
};

export function parseImportCliArgs(args: string[]): ImportCliOptions {
  const [inputPath, reportPath, ...flags] = args;
  if (!inputPath || !reportPath) {
    throw new Error("Usage: pnpm data:import <normalized.json> <report.json> [--validate-only | --dry-run | --apply] [--batch-size N] [--image-root path]");
  }
  let mode: ImportMode = "validate-only";
  let selectedMode = false;
  let batchSize = 100;
  let imageRoot: string | undefined;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--validate-only" || flag === "--dry-run" || flag === "--apply") {
      if (selectedMode) throw new Error("Select exactly one import mode");
      selectedMode = true;
      mode = flag.slice(2) as ImportMode;
    } else if (flag === "--batch-size") {
      batchSize = Number(flags[++index]);
    } else if (flag === "--image-root") {
      const value = flags[++index];
      if (!value || value.trim().length === 0) throw new Error("--image-root requires a path");
      imageRoot = value;
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return { inputPath, reportPath, mode, batchSize, ...(imageRoot ? { imageRoot } : {}) };
}

function comparablePath(path: string): string {
  const absolutePath = resolve(path);
  return process.platform === "win32" ? absolutePath.toLocaleLowerCase("en-US") : absolutePath;
}

function assertSeparatedPaths(options: ImportCliOptions): void {
  if (comparablePath(options.inputPath) === comparablePath(options.reportPath)) {
    throw new Error("Import report must not overwrite the normalized input file");
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function inspectPath(path: string): Promise<ImagePathStatus> {
  try {
    const info = await stat(path);
    return info.isFile() ? "ok" : "not-file";
  } catch (error) {
    if (isObjectWithCode(error) && error.code === "ENOENT") return "missing";
    return "unreadable";
  }
}

function isObjectWithCode(value: unknown): value is { code: string } {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * scripts/data/validator.ts (Member 4's file, reused as-is) is the
 * validation gate -- not a single strict Zod .parse() of the whole file.
 * That distinction matters here: canonicalLocationRecordSchema
 * (scripts/data/contracts.ts) is .strict() and would throw on the very
 * first malformed record, which is the opposite of "report why and skip
 * just that record" (this task's requirement). validateLocationDataset
 * already reports per-record errors with a locationIndex, which is exactly
 * what "skip failed records, keep going" needs -- this function only turns
 * that into a valid/invalid split of the already-loosely-typed input.
 */
function splitValidRecords(input: unknown, report: DataValidationReport): { valid: CanonicalLocationRecord[]; skippedCount: number } {
  if (!isObject(input) || !Array.isArray(input.locations)) return { valid: [], skippedCount: 0 };
  const invalidIndexes = new Set(report.errors.flatMap((error) => (error.locationIndex === null ? [] : [error.locationIndex])));
  const valid: CanonicalLocationRecord[] = [];
  input.locations.forEach((location, index) => {
    if (invalidIndexes.has(index)) return;
    valid.push(location as CanonicalLocationRecord);
  });
  return { valid, skippedCount: invalidIndexes.size };
}

function createLocationImportDatabase(client: SupabaseClient): LocationImportDatabase {
  return {
    async findExistingLocationIds(ids) {
      const { data, error } = await client.from("locations").select("id").in("id", ids);
      if (error) throw new Error(`Unable to check existing locations: ${error.message}`);
      return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    },
    async findExistingParkingKeys(locationIds) {
      const { data, error } = await client.from("parking").select("location_id, name").in("location_id", locationIds);
      if (error) throw new Error(`Unable to check existing parking: ${error.message}`);
      return (data ?? []) as ExistingParkingKey[];
    },
    async upsertLocations(rows: LocationRow[]) {
      const { error } = await client.from("locations").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Unable to upsert locations: ${error.message}`);
    },
    async upsertParking(rows: ParkingRow[]) {
      const { error } = await client.from("parking").upsert(rows, { onConflict: "location_id,name" });
      if (error) throw new Error(`Unable to upsert parking: ${error.message}`);
    },
  };
}

export async function runImport(options: ImportCliOptions): Promise<void> {
  assertSeparatedPaths(options);
  const inputText = await readFile(options.inputPath, "utf8");
  let input: unknown;
  try {
    input = JSON.parse(inputText) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in normalized input file: ${options.inputPath}`, { cause: error });
  }

  const imageRoot = resolve(options.imageRoot ?? dirname(resolve(options.inputPath)));
  const report = await validateLocationDataset(input, {
    inspectImagePath: (imagePath) => inspectPath(resolve(imageRoot, imagePath)),
  });
  await writeJsonAtomic(options.reportPath, report);

  const { valid, skippedCount } = splitValidRecords(input, report);
  console.log(
    `Location validation: total=${report.summary.totalLocations}, valid=${valid.length}, skipped=${skippedCount}, errors=${report.summary.errorCount}, report=${options.reportPath}`,
  );
  if (skippedCount > 0) {
    console.log("Skipped records (see report for full detail):");
    for (const error of report.errors) {
      if (error.locationIndex !== null) console.log(`  [${error.locationIndex}] ${error.code} ${error.field}: ${error.message}`);
    }
  }

  let database: LocationImportDatabase | undefined;
  if (options.mode !== "validate-only") {
    const environment = readSupabaseAdminEnvironment(process.env);
    database = createLocationImportDatabase(createSupabaseAdminClient(environment));
  }

  const result = await importLocationDataset(valid, options.mode, options.batchSize, database);
  console.log(
    `Location import: mode=${result.mode}, ` +
    `locations(validated=${result.locations.validated}, existing=${result.locations.existing}, toInsert=${result.locations.toInsert}, written=${result.locations.written}), ` +
    `parking(validated=${result.parking.validated}, existing=${result.parking.existing}, toInsert=${result.parking.toInsert}, written=${result.parking.written})`,
  );

  if (skippedCount > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const options = parseImportCliArgs(process.argv.slice(2));
  await runImport(options);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
