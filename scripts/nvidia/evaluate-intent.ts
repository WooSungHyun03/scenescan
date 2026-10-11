import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { NvidiaIntentClient, NvidiaIntentError } from "../../src/infrastructure/nvidia/intent-client.ts";
import { NVIDIA_INTENT_ALLOWED_MODELS } from "../../src/infrastructure/nvidia/intent-models.ts";
import { parseTextSearchQuery } from "../../src/domains/search/server/text-query-parser.ts";
import { applyNvidiaIntentOverride } from "../../src/domains/search/server/nvidia-intent-merge.ts";

// Opt-in live requests reuse the production client, prompt, validator and
// parser. Reports contain curated queries/validated intent, never credentials.
const queriesSchema = z.object({
  schema_version: z.literal(1),
  queries: z.array(z.object({ id: z.string().min(1), text: z.string().min(1).max(200) })).min(1),
});

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const queriesIndex = args.indexOf("--queries");
  const path = resolve(queriesIndex < 0 ? "scripts/nvidia/fixtures/eval-queries.json" : args[queriesIndex + 1]);
  const { queries } = queriesSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const model = z.enum(NVIDIA_INTENT_ALLOWED_MODELS).parse(process.env.NVIDIA_INTENT_MODEL || NVIDIA_INTENT_ALLOWED_MODELS[0]);
  if (live && (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_INTENT_ENABLED !== "true")) {
    throw new Error("--live requires NVIDIA_API_KEY and NVIDIA_INTENT_ENABLED=true; no API request was made.");
  }
  let lastHttpStatus: number | undefined;
  const client = live ? new NvidiaIntentClient({
    apiKey: process.env.NVIDIA_API_KEY, model,
    fetcher: async (...input) => {
      const response = await fetch(...input);
      lastHttpStatus = response.status;
      return response;
    },
  }) : null;
  console.log(JSON.stringify({ provider: live ? "NVIDIA live" : "offline parser only", model }));
  for (const query of queries) {
    const base = parseTextSearchQuery(query.text);
    const started = Date.now();
    lastHttpStatus = undefined;
    try {
      const intent = client && !base.outOfScope ? await client.extractIntent(query.text) : null;
      console.log(JSON.stringify({ id: query.id, status: intent ? "ok" : "skipped", httpStatus: lastHttpStatus,
        latencyMs: Date.now() - started, base, intent, augmented: intent ? applyNvidiaIntentOverride(base, intent) : base }));
    } catch (error) {
      console.log(JSON.stringify({ id: query.id, status: "failed", httpStatus: lastHttpStatus,
        code: error instanceof NvidiaIntentError ? error.code : "UNKNOWN", latencyMs: Date.now() - started }));
      process.exitCode = 1;
    }
  }
}

main().catch(() => { console.error("NVIDIA evaluation failed; check fixture and server-only environment configuration."); process.exitCode = 1; });
