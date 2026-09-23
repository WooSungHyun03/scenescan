import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSourceMapping, type NormalizedLocationOutput } from "./contracts.ts";
import { normalizeDataset } from "./normalizer.ts";

export type NormalizeCliOptions = {
  rawPath: string;
  mappingPath: string;
  outputPath: string;
};

export function parseNormalizeCliArgs(args: string[]): NormalizeCliOptions {
  if (args.length !== 3 || args.some((value) => value.trim().length === 0)) {
    throw new Error("Usage: pnpm data:normalize <raw.json> <mapping.json> <normalized.json>");
  }
  const [rawPath, mappingPath, outputPath] = args;
  return { rawPath, mappingPath, outputPath };
}

function assertSeparatedPaths(options: NormalizeCliOptions): void {
  const comparablePath = (path: string) => {
    const absolutePath = resolve(path);
    return process.platform === "win32" ? absolutePath.toLocaleLowerCase("en-US") : absolutePath;
  };
  const rawPath = comparablePath(options.rawPath);
  const mappingPath = comparablePath(options.mappingPath);
  const outputPath = comparablePath(options.outputPath);
  if (outputPath === rawPath) throw new Error("Normalized output must not overwrite the raw source file");
  if (outputPath === mappingPath) throw new Error("Normalized output must not overwrite the mapping file");
}

async function readJson(path: string, label: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${label} file: ${path}`, { cause: error });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${label} file: ${path}`, { cause: error });
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export async function normalizeLocationFile(options: NormalizeCliOptions): Promise<NormalizedLocationOutput> {
  assertSeparatedPaths(options);
  const [raw, mappingValue] = await Promise.all([
    readJson(options.rawPath, "raw source"),
    readJson(options.mappingPath, "mapping"),
  ]);
  const mapping = parseSourceMapping(mappingValue);
  const output = normalizeDataset(raw, mapping);
  await writeJsonAtomic(options.outputPath, output);
  return output;
}

async function main(): Promise<void> {
  const options = parseNormalizeCliArgs(process.argv.slice(2));
  const output = await normalizeLocationFile(options);
  console.log(`Location normalization: source=${output.source.name}, normalized=${output.locations.length}, output=${options.outputPath}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
