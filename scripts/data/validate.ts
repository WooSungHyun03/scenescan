import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateLocationDataset,
  type DataValidationMode,
  type DataValidationReport,
  type ImagePathInspection,
  type ImagePathStatus,
} from "./validator.ts";

export type ValidateCliOptions = {
  inputPath: string;
  reportPath: string;
  mode: DataValidationMode;
  imageRoot?: string;
  embeddingManifestPath?: string;
  imageLicensesPath?: string;
};

type FileIdentity = {
  path: string;
  sha256: string;
};

export type DataValidationFileReport = DataValidationReport & {
  input: {
    locations: FileIdentity;
    embeddingManifest: FileIdentity | null;
    imageLicenses: FileIdentity | null;
    imageRoot: string | null;
  };
};

export type ValidateLocationFileResult = {
  report: DataValidationFileReport;
  outputPath: string;
};

const USAGE = "Usage: pnpm data:validate <normalized.json> <report.json> (--metadata-only | --require-local-assets --image-root path) [--embedding-manifest path --image-licenses path]";

export function parseValidateCliArgs(args: string[]): ValidateCliOptions {
  const [inputPath, reportPath, ...flags] = args;
  if (!inputPath || !reportPath) throw new Error(USAGE);

  let mode: DataValidationMode | undefined;
  let imageRoot: string | undefined;
  let embeddingManifestPath: string | undefined;
  let imageLicensesPath: string | undefined;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--metadata-only" || flag === "--require-local-assets") {
      if (mode) throw new Error("Select exactly one validation mode");
      mode = flag.slice(2) as DataValidationMode;
    } else if (flag === "--image-root") {
      const value = flags[++index];
      if (!value || value.trim().length === 0) throw new Error("--image-root requires a path");
      imageRoot = value;
    } else if (flag === "--embedding-manifest") {
      const value = flags[++index];
      if (!value || value.trim().length === 0) throw new Error("--embedding-manifest requires a path");
      embeddingManifestPath = value;
    } else if (flag === "--image-licenses") {
      const value = flags[++index];
      if (!value || value.trim().length === 0) throw new Error("--image-licenses requires a path");
      imageLicensesPath = value;
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }

  if (!mode) throw new Error(`Validation mode is required. ${USAGE}`);
  if (mode === "require-local-assets" && !imageRoot) {
    throw new Error("--require-local-assets requires an explicit --image-root path");
  }
  if (mode === "metadata-only" && imageRoot) {
    throw new Error("--image-root is only valid with --require-local-assets");
  }
  if (Boolean(embeddingManifestPath) !== Boolean(imageLicensesPath)) {
    throw new Error("--embedding-manifest and --image-licenses must be provided together");
  }

  return {
    inputPath,
    reportPath,
    mode,
    ...(imageRoot ? { imageRoot } : {}),
    ...(embeddingManifestPath ? { embeddingManifestPath } : {}),
    ...(imageLicensesPath ? { imageLicensesPath } : {}),
  };
}

function comparablePath(path: string): string {
  const absolutePath = resolve(path);
  return process.platform === "win32" ? absolutePath.toLocaleLowerCase("en-US") : absolutePath;
}

function assertSeparatedPaths(options: ValidateCliOptions): void {
  if (comparablePath(options.inputPath) === comparablePath(options.reportPath)) {
    throw new Error("Validation report must not overwrite the normalized input file");
  }
}

export function failedReportPath(reportPath: string, mode: DataValidationMode): string {
  return reportPath.toLowerCase().endsWith(".json")
    ? `${reportPath.slice(0, -5)}.failed.${mode}.json`
    : `${reportPath}.failed.${mode}.json`;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, absolutePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function inspectPath(path: string): Promise<ImagePathStatus | ImagePathInspection> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return "not-file";
    const bytes = await readFile(path);
    return {
      status: "ok",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (isObjectWithCode(error) && error.code === "ENOENT") return "missing";
    return "unreadable";
  }
}

function isObjectWithCode(value: unknown): value is { code: string } {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";
}

function displayPath(path: string): string {
  const value = relative(process.cwd(), resolve(path)).replaceAll("\\", "/");
  return value.length > 0 ? value : ".";
}

function identity(path: string, contents: string): FileIdentity {
  return {
    path: displayPath(path),
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

async function readJson(path: string, label: string): Promise<{ text: string; value: unknown }> {
  const text = await readFile(path, "utf8");
  try {
    return { text, value: JSON.parse(text) as unknown };
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${path}`, { cause: error });
  }
}

export async function validateLocationFile(
  options: ValidateCliOptions,
): Promise<ValidateLocationFileResult> {
  assertSeparatedPaths(options);
  const locations = await readJson(options.inputPath, "normalized input file");
  const embeddingManifest = options.embeddingManifestPath
    ? await readJson(options.embeddingManifestPath, "embedding manifest")
    : null;
  const imageLicenses = options.imageLicensesPath
    ? await readJson(options.imageLicensesPath, "image license catalog")
    : null;
  const imageRoot = options.imageRoot ? resolve(options.imageRoot) : null;
  const inspections = new Map<string, Promise<ImagePathStatus | ImagePathInspection>>();
  const inspectFromRoot = (imagePath: string) => {
    const absolutePath = resolve(imageRoot!, imagePath);
    const existing = inspections.get(absolutePath);
    if (existing) return existing;
    const pending = inspectPath(absolutePath);
    inspections.set(absolutePath, pending);
    return pending;
  };
  const baseReport = await validateLocationDataset(locations.value, {
    mode: options.mode,
    ...(imageRoot
      ? { inspectImagePath: inspectFromRoot }
      : {}),
    ...(embeddingManifest ? { embeddingManifest: embeddingManifest.value } : {}),
    ...(imageLicenses ? { imageLicenses: imageLicenses.value } : {}),
  });
  const report: DataValidationFileReport = {
    ...baseReport,
    input: {
      locations: identity(options.inputPath, locations.text),
      embeddingManifest: embeddingManifest && options.embeddingManifestPath
        ? identity(options.embeddingManifestPath, embeddingManifest.text)
        : null,
      imageLicenses: imageLicenses && options.imageLicensesPath
        ? identity(options.imageLicensesPath, imageLicenses.text)
        : null,
      imageRoot: imageRoot ? displayPath(imageRoot) : null,
    },
  };
  const outputPath = report.valid
    ? options.reportPath
    : failedReportPath(options.reportPath, options.mode);
  if (comparablePath(options.inputPath) === comparablePath(outputPath)) {
    throw new Error("Validation failure report must not overwrite the normalized input file");
  }
  await writeJsonAtomic(outputPath, report);
  return { report, outputPath };
}

async function main(): Promise<void> {
  const options = parseValidateCliArgs(process.argv.slice(2));
  const { report, outputPath } = await validateLocationFile(options);
  console.log(
    `Location validation: mode=${report.mode}, valid=${report.valid}, total=${report.summary.totalLocations}, errors=${report.summary.errorCount}, report=${outputPath}`,
  );
  if (!report.valid) process.exitCode = 1;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
