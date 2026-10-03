import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkAttributionLinks, collectAttributionLinks } from "./attribution-link-checker.ts";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import {
  createProductionRows,
  parseImageLicenseCatalog,
  parseProductionEmbeddingManifest,
} from "./production-importer.ts";

type Options = {
  locationsPath: string;
  manifestPath: string;
  licensesPath: string;
  outputPath: string;
  concurrency: number;
  timeoutMs: number;
};

export function parseAttributionLinkCheckArgs(args: string[]): Options {
  const [locationsPath, manifestPath, ...flags] = args;
  if (!locationsPath || !manifestPath) {
    throw new Error("Usage: pnpm data:check-attribution-links <locations.json> <embeddings-manifest.json> --output <report.json> [--image-licenses PATH] [--concurrency N] [--timeout-ms N]");
  }
  let licensesPath = resolve(dirname(locationsPath), "image-licenses.json");
  let outputPath: string | undefined;
  let concurrency = 8;
  let timeoutMs = 10_000;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--image-licenses") {
      licensesPath = flags[++index] ?? "";
      if (!licensesPath) throw new Error("--image-licenses requires a path");
    } else if (flag === "--output") {
      outputPath = flags[++index];
      if (!outputPath) throw new Error("--output requires a path");
    } else if (flag === "--concurrency") {
      concurrency = Number(flags[++index]);
    } else if (flag === "--timeout-ms") {
      timeoutMs = Number(flags[++index]);
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  if (!outputPath) throw new Error("--output is required");
  return { locationsPath, manifestPath, licensesPath, outputPath, concurrency, timeoutMs };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const options = parseAttributionLinkCheckArgs(process.argv.slice(2));
  const rows = createProductionRows(
    parseNormalizedLocationOutput(await readJson(options.locationsPath)),
    parseProductionEmbeddingManifest(await readJson(options.manifestPath)),
    parseImageLicenseCatalog(await readJson(options.licensesPath)),
  );
  const report = await checkAttributionLinks(collectAttributionLinks(rows), {
    concurrency: options.concurrency,
    timeoutMs: options.timeoutMs,
  });
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    `Attribution links: urls=${report.summary.urls}, reachable=${report.summary.reachable}, broken=${report.summary.broken}, unverified=${report.summary.unverified}, report=${options.outputPath}`,
  );
  if (report.summary.broken > 0) process.exitCode = 1;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
