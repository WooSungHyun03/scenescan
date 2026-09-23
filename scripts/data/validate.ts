import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateLocationDataset,
  type DataValidationReport,
  type ImagePathStatus,
} from "./validator.ts";

export type ValidateCliOptions = {
  inputPath: string;
  reportPath: string;
  imageRoot?: string;
};

export function parseValidateCliArgs(args: string[]): ValidateCliOptions {
  const [inputPath, reportPath, ...flags] = args;
  if (!inputPath || !reportPath) {
    throw new Error("Usage: pnpm data:validate <normalized.json> <report.json> [--image-root path]");
  }
  let imageRoot: string | undefined;
  for (let index = 0; index < flags.length; index += 1) {
    if (flags[index] === "--image-root") {
      const value = flags[++index];
      if (!value || value.trim().length === 0) throw new Error("--image-root requires a path");
      imageRoot = value;
    } else {
      throw new Error(`Unknown option: ${flags[index]}`);
    }
  }
  return { inputPath, reportPath, ...(imageRoot ? { imageRoot } : {}) };
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

export async function validateLocationFile(options: ValidateCliOptions): Promise<DataValidationReport> {
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
  return report;
}

async function main(): Promise<void> {
  const options = parseValidateCliArgs(process.argv.slice(2));
  const report = await validateLocationFile(options);
  console.log(
    `Location validation: valid=${report.valid}, total=${report.summary.totalLocations}, errors=${report.summary.errorCount}, report=${options.reportPath}`,
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
