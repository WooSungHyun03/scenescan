import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseManifest } from "../embeddings/contracts.ts";
import { readDatabaseEnvironment } from "../embeddings/import.ts";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import { buildStoragePlan, readValidatedJpeg, isIdenticalStoredJpeg } from "./storage-uploader.ts";

type Mode = "dry-run" | "apply";
type CliOptions = {
  datasetPath: string;
  manifestPath: string;
  outputDirectory: string;
  bucket: string;
  mode: Mode;
  concurrency: number;
};

export function parseStorageUploadArgs(args: string[]): CliOptions {
  const [datasetPath, manifestPath, outputDirectory, ...flags] = args;
  if (!datasetPath || !manifestPath || !outputDirectory) {
    throw new Error("Usage: pnpm data:upload-storage <locations.json> <embeddings-manifest.json> <output-dir> [--dry-run | --apply] [--bucket name] [--concurrency N]");
  }
  let mode: Mode = "dry-run";
  let modeSelected = false;
  let bucket = "location-images";
  let concurrency = 4;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--dry-run" || flag === "--apply") {
      if (modeSelected) throw new Error("Select exactly one upload mode");
      modeSelected = true;
      mode = flag.slice(2) as Mode;
    } else if (flag === "--bucket") bucket = flags[++index] ?? "";
    else if (flag === "--concurrency") concurrency = Number(flags[++index]);
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("--concurrency must be an integer between 1 and 8");
  }
  return {
    datasetPath: resolve(datasetPath),
    manifestPath: resolve(manifestPath),
    outputDirectory: resolve(outputDirectory),
    bucket,
    mode,
    concurrency,
  };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function mapConcurrent<T>(values: T[], concurrency: number, task: (value: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) await task(values[nextIndex++]);
  }));
}

async function main(): Promise<void> {
  const options = parseStorageUploadArgs(process.argv.slice(2));
  const environment = readDatabaseEnvironment(process.env);
  const dataset = parseNormalizedLocationOutput(JSON.parse(await readFile(options.datasetPath, "utf8")) as unknown);
  const manifest = parseManifest(JSON.parse(await readFile(options.manifestPath, "utf8")) as unknown);
  const plan = buildStoragePlan(
    dataset,
    manifest,
    options.manifestPath,
    environment.url,
    options.bucket,
    options.outputDirectory,
  );
  let totalBytes = 0;
  await mapConcurrent(plan.items, options.concurrency, async (item) => {
    const buffer = await readValidatedJpeg(item.localPath);
    totalBytes += buffer.length;
  });

  if (options.mode === "dry-run") {
    console.log(`Storage upload: mode=dry-run, bucket=${options.bucket}, files=${plan.items.length}, bytes=${totalBytes}`);
    return;
  }

  const client = createClient(environment.url, environment.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const existing = await client.storage.getBucket(options.bucket);
  if (existing.error) {
    const created = await client.storage.createBucket(options.bucket, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg"],
    });
    if (created.error) throw new Error(`Unable to create storage bucket: ${created.error.message}`);
  } else if (!existing.data.public) {
    throw new Error(`Existing bucket ${options.bucket} is private; refusing to change its access policy automatically`);
  }

  let uploaded = 0;
  let skipped = 0;
  await mapConcurrent(plan.items, options.concurrency, async (item) => {
    // Validate all files before the first write, but retain only the current
    // concurrent uploads in memory instead of the entire image catalog.
    const buffer = await readValidatedJpeg(item.localPath);
    const existingObject = await client.storage.from(options.bucket).info(item.objectPath);
    if (existingObject.data && isIdenticalStoredJpeg(buffer, existingObject.data)) {
      skipped += 1;
      return;
    }
    if (existingObject.data) throw new Error(`Existing Storage image differs: ${item.objectPath}; assign a reviewed new image UUID instead of overwriting production bytes`);
    if (existingObject.error && !["404", "400"].includes(existingObject.error.statusCode ?? "")) {
      throw new Error(`Unable to inspect ${item.objectPath}: ${existingObject.error.message}`);
    }
    const result = await client.storage.from(options.bucket).upload(item.objectPath, buffer, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    if (result.error) throw new Error(`Unable to upload ${item.objectPath}: ${result.error.message}`);
    uploaded += 1;
    if (uploaded % 25 === 0 || uploaded === plan.items.length) console.log(`Uploaded ${uploaded}/${plan.items.length}`);
  });

  await mkdir(options.outputDirectory, { recursive: true });
  await writeJsonAtomic(resolve(options.outputDirectory, "locations.json"), plan.dataset);
  await writeJsonAtomic(resolve(options.outputDirectory, "embeddings-manifest.json"), plan.manifest);
  console.log(`Storage upload: mode=apply, bucket=${options.bucket}, uploaded=${uploaded}, unchanged=${skipped}, catalog_bytes=${totalBytes}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
