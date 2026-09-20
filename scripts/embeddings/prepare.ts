import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { pipeline } from "@huggingface/transformers";
import {
  CLIP_MODEL_ID,
  CLIP_MODEL_REVISION,
} from "../../src/lib/ai/embedding-service.ts";
import { decodeLocalImage, prepareEmbeddings } from "./pipeline.ts";

type CliOptions = {
  manifestPath: string;
  outputPath: string;
  batchSize: number;
  retries: number;
  resume: boolean;
};

export function parseCliArgs(args: string[]): CliOptions {
  const [manifestPath, outputPath, ...flags] = args;
  if (!manifestPath || !outputPath) {
    throw new Error("Usage: pnpm embeddings:prepare <manifest.json> <output.json> [--batch-size N] [--retries N] [--no-resume]");
  }
  const options: CliOptions = { manifestPath, outputPath, batchSize: 8, retries: 1, resume: true };
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--no-resume") options.resume = false;
    else if (flag === "--batch-size") options.batchSize = Number(flags[++index]);
    else if (flag === "--retries") options.retries = Number(flags[++index]);
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

async function transformersVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(new URL("../../node_modules/@huggingface/transformers/package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };
  if (typeof packageJson.version !== "string") throw new Error("Unable to determine Transformers.js version");
  return packageJson.version;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const version = await transformersVersion();
  const result = await prepareEmbeddings(options, {
    transformersVersion: version,
    decodeImage: decodeLocalImage,
    loadExtractor: async () => {
      const extractor = await pipeline("image-feature-extraction", CLIP_MODEL_ID, {
        revision: CLIP_MODEL_REVISION,
      });
      return async (images) => (
        await extractor(images as Parameters<typeof extractor>[0])
      ).data;
    },
    onProgress: console.log,
  });
  console.log(`Embedding output: completed=${result.output.items.length}, failed=${result.output.failures.length}, resumed=${result.resumed}`);
  if (result.output.failures.length > 0) process.exitCode = 1;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
