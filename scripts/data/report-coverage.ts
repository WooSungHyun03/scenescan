import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCollectionManifest } from "./collect-commons.ts";
import { createCoverageReport, MINIMUM_LOCATIONS_PER_CELL } from "./coverage.ts";

type CoverageCliOptions = {
  manifestPath: string;
  outputPath: string;
  targetMinimumPerCell: number;
};

export function parseCoverageArgs(args: string[]): CoverageCliOptions {
  const manifestPath = resolve(args[0] ?? "data/production/commons-manifest.json");
  let outputPath = resolve("data/production/coverage-report.json");
  let targetMinimumPerCell = MINIMUM_LOCATIONS_PER_CELL;
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--output") {
      const value = args[++index];
      if (!value) throw new Error("--output requires a path");
      outputPath = resolve(value);
    }
    else if (flag === "--target") targetMinimumPerCell = Number(args[++index]);
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isInteger(targetMinimumPerCell) || targetMinimumPerCell < 1 || targetMinimumPerCell > 20) {
    throw new Error("--target must be an integer between 1 and 20");
  }
  return { manifestPath, outputPath, targetMinimumPerCell };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function main(): Promise<void> {
  const options = parseCoverageArgs(process.argv.slice(2));
  const manifest = parseCollectionManifest(
    JSON.parse(await readFile(options.manifestPath, "utf8")) as unknown,
  );
  const report = createCoverageReport(manifest.locations, options.targetMinimumPerCell);
  await writeJsonAtomic(options.outputPath, report);
  console.log(
    `Coverage report: locations=${report.totalLocations}, under-target=${report.summary.underTargetCells}/${report.summary.totalCells}, deficit=${report.summary.totalDeficit}`,
  );
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
