import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, readSupabaseAdminEnvironment } from "../shared/supabase-admin-client.ts";
import { parseNormalizedLocationOutput, type NormalizedLocationOutput } from "./contracts.ts";

/**
 * Requirement 7: "부산 외 데이터 정리: 삭제 대상 manifest, 복구 절차 문서,
 * 기본 dry-run 도구만 만든다. 실제 삭제 실행 금지. 실제 실행은 명시 플래그가
 * 있어야만 가능하게 한다."
 *
 * Plan mode (the CLI default, and the only mode this ticket's author ever
 * runs) touches only the local `locations.json` file and never connects to
 * Supabase at all -- it writes a deletion-candidate manifest and exits.
 * Apply mode requires BOTH `--apply` and a second, differently-worded
 * `--yes-delete-non-busan-locations` flag (defense in depth, same spirit
 * as DELETE /api/account's typed "회원탈퇴" confirmation) and real Supabase
 * admin credentials; only then does it delete anything. This file's own
 * author never passes those flags against a real project.
 *
 * Restore procedure (if apply mode is ever used and a location turns out
 * to still be wanted): this tool only deletes DATABASE ROWS. The reviewed
 * source catalog (`data/production/commons-manifest.json`,
 * `data/production/locations.json`, `data/production/image-licenses.json`,
 * `data/production/embeddings-manifest.json`, `data/production/embeddings.json`)
 * is a separate, git-committed artifact this tool never modifies or
 * deletes. To restore a deleted location:
 *   1. Confirm the location's entry is still present in the committed
 *      `data/production/locations.json` (if it was also removed from that
 *      file in a later commit, `git show <prior-commit>:data/production/locations.json`
 *      to recover it first).
 *   2. Re-run the normal production import for just that data:
 *      `pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --dry-run`
 *      then `--apply` (both operations are idempotent by stable UUID, see
 *      scripts/data/README.md) -- this re-inserts the location, image
 *      metadata, and (if present) parking rows.
 *   3. Re-run `pnpm embeddings:import data/production/embeddings.json --apply`
 *      to restore the image embedding vectors.
 *   4. This tool does not touch Supabase Storage objects (the location's
 *      photo files) -- those are untouched by a locations-table delete in
 *      the first place (cascade only reaches `location_images`/
 *      `user_shortlist` metadata rows, not Storage), so no separate Storage
 *      restore step is needed.
 */

export type CleanupCandidate = {
  id: string;
  name: string;
  region: string;
  imageCount: number;
};

export type NonBusanCleanupManifest = {
  schemaVersion: 1;
  generatedAt: string;
  reason: string;
  totalLocations: number;
  busanLocations: number;
  nonBusanLocations: number;
  candidates: CleanupCandidate[];
};

export function buildNonBusanCleanupManifest(
  dataset: NormalizedLocationOutput,
  generatedAt: string,
): NonBusanCleanupManifest {
  const candidates = dataset.locations
    .filter((location) => location.region !== "부산")
    .map((location) => {
      if (!location.id) throw new Error(`Location "${location.name}" has no id; assign one before planning cleanup`);
      return {
        id: location.id,
        name: location.name,
        region: location.region,
        imageCount: location.images.length,
      };
    });
  return {
    schemaVersion: 1,
    generatedAt,
    reason: "Live product scope is Busan-only (see docs/database.md's Busan-district contract); this plans removal of every non-Busan row from the previously nationwide catalog.",
    totalLocations: dataset.locations.length,
    busanLocations: dataset.locations.length - candidates.length,
    nonBusanLocations: candidates.length,
    candidates,
  };
}

export type NonBusanCleanupDatabase = {
  deleteParkingForLocations(locationIds: string[]): Promise<void>;
  deleteLocations(locationIds: string[]): Promise<void>;
};

export type CleanupMode = "plan" | "apply";

export type CleanupResult = {
  mode: CleanupMode;
  candidateCount: number;
  locationsDeleted: number;
};

/**
 * `mode: "plan"` never touches `database` at all (it may be omitted).
 * `mode: "apply"` requires `database` and deletes every candidate's
 * parking rows first (parking.location_id is ON DELETE SET NULL, not
 * CASCADE -- deleting locations first would leave orphaned, unreachable
 * parking rows behind) and then the location rows themselves (which
 * cascades to location_images/user_shortlist per the schema).
 */
export async function runNonBusanCleanup(
  manifest: NonBusanCleanupManifest,
  mode: CleanupMode,
  database?: NonBusanCleanupDatabase,
): Promise<CleanupResult> {
  const candidateCount = manifest.candidates.length;
  if (mode === "plan") {
    return { mode, candidateCount, locationsDeleted: 0 };
  }
  if (!database) throw new Error("A database connection is required to apply non-Busan cleanup");
  const ids = manifest.candidates.map((candidate) => candidate.id);
  if (ids.length === 0) return { mode, candidateCount, locationsDeleted: 0 };
  await database.deleteParkingForLocations(ids);
  await database.deleteLocations(ids);
  return { mode, candidateCount, locationsDeleted: ids.length };
}

export function createNonBusanCleanupDatabase(client: SupabaseClient): NonBusanCleanupDatabase {
  return {
    async deleteParkingForLocations(locationIds) {
      const { error } = await client.from("parking").delete().in("location_id", locationIds);
      if (error) throw new Error(`Unable to delete parking rows for removed locations: ${error.message}`);
    },
    async deleteLocations(locationIds) {
      const { error } = await client.from("locations").delete().in("id", locationIds);
      if (error) throw new Error(`Unable to delete locations: ${error.message}`);
    },
  };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

type CliOptions = {
  locationsPath: string;
  outputPath: string;
  apply: boolean;
  confirmedDelete: boolean;
};

const APPLY_FLAG = "--apply";
const CONFIRMATION_FLAG = "--yes-delete-non-busan-locations";

export function parseNonBusanCleanupArgs(args: string[]): CliOptions {
  const [locationsPath, outputPath, ...flags] = args;
  if (!locationsPath || !outputPath) {
    throw new Error(`Usage: pnpm data:plan-non-busan-cleanup <locations.json> <output-manifest.json> [${APPLY_FLAG} ${CONFIRMATION_FLAG}]`);
  }
  let apply = false;
  let confirmedDelete = false;
  for (const flag of flags) {
    if (flag === APPLY_FLAG) apply = true;
    else if (flag === CONFIRMATION_FLAG) confirmedDelete = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return { locationsPath: resolve(locationsPath), outputPath: resolve(outputPath), apply, confirmedDelete };
}

async function main(): Promise<void> {
  const options = parseNonBusanCleanupArgs(process.argv.slice(2));
  const dataset = parseNormalizedLocationOutput(JSON.parse(await readFile(options.locationsPath, "utf8")) as unknown);
  const manifest = buildNonBusanCleanupManifest(dataset, new Date().toISOString());
  await writeJsonAtomic(options.outputPath, manifest);
  console.log(
    `Non-Busan cleanup plan: ${manifest.nonBusanLocations} candidate(s) of ${manifest.totalLocations} total (${manifest.busanLocations} Busan). Manifest written to ${options.outputPath}.`,
  );

  const requestedApply = options.apply || options.confirmedDelete;
  if (!options.apply || !options.confirmedDelete) {
    if (requestedApply) {
      throw new Error(`Both ${APPLY_FLAG} and ${CONFIRMATION_FLAG} are required to delete anything; refusing a partial confirmation.`);
    }
    console.log(`Dry-run only (default). Pass ${APPLY_FLAG} ${CONFIRMATION_FLAG} with real Supabase admin credentials to actually delete.`);
    return;
  }

  const environment = readSupabaseAdminEnvironment(process.env);
  const client = createSupabaseAdminClient(environment);
  const database = createNonBusanCleanupDatabase(client);
  const result = await runNonBusanCleanup(manifest, "apply", database);
  console.log(`Deleted ${result.locationsDeleted} non-Busan location(s) and their parking rows.`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
