import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { AutoTokenizer, CLIPTextModelWithProjection } from "@huggingface/transformers";
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION, CLIP_MODEL_DTYPE } from "../../src/lib/ai/embedding-service.ts";
import { toValidatedEmbedding } from "../../src/lib/ai/embedding-validation.ts";
import { cosineSimilarity } from "../../src/lib/ai/vector-math.ts";
import { parseOutput } from "./contracts.ts";

// Offline feasibility probe only: never imported by the browser or API.
// English controls distinguish model language limitations from missing dataset coverage.
const queries = [
  ["노을이 보이는 바닷가", "a beach at sunset"],
  ["오래된 공장 같은 장소", "an old industrial factory"],
  ["현대적인 흰색 건물", "a modern white building"],
  ["조용한 골목길", "a quiet narrow alley"],
  ["도시 야경이 보이는 옥상", "a rooftop overlooking a city at night"],
] as const;

const output = parseOutput(JSON.parse(await readFile("data/production/embeddings.json", "utf8")));
const catalog = JSON.parse(await readFile("data/production/commons-manifest.json", "utf8")) as {
  locations: Array<{ id: string; name: string; category: string; region: string }>;
};
const locations = new Map(catalog.locations.map((location) => [location.id, location]));
const start = performance.now();
let downloadedBytes = 0;
const completedFiles = new Set<string>();
const tokenizer = await AutoTokenizer.from_pretrained(CLIP_MODEL_ID, { revision: CLIP_MODEL_REVISION });
const model = await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
  revision: CLIP_MODEL_REVISION,
  dtype: CLIP_MODEL_DTYPE,
  progress_callback: (event) => {
    if (event.status === "progress" && event.loaded === event.total && !completedFiles.has(event.file)) {
      completedFiles.add(event.file);
      downloadedBytes += event.total;
    }
  },
});
const loadMs = performance.now() - start;
const results = [];
for (const pair of queries) {
  const languages = [];
  for (const [index, query] of pair.entries()) {
    const started = performance.now();
    const inputs = await tokenizer(query, { padding: true, truncation: true });
    const tensor = (await model(inputs)).text_embeds;
    const embedding = toValidatedEmbedding(Array.from(tensor.data, Number));
    const best = new Map<string, { location_id: string; image_id: string; similarity: number }>();
    for (const image of output.items) {
      const similarity = cosineSimilarity(embedding, image.embedding);
      const previous = best.get(image.location_id);
      if (!previous || similarity > previous.similarity) {
        best.set(image.location_id, { location_id: image.location_id, image_id: image.image_id, similarity });
      }
    }
    const top = [...best.values()].sort((a, b) => b.similarity - a.similarity || a.location_id.localeCompare(b.location_id)).slice(0, 8);
    languages.push({ language: index === 0 ? "ko" : "en", query, inference_ms: performance.now() - started,
      results: top.map((hit) => { const location = locations.get(hit.location_id);
        return { ...hit, name: location?.name, category: location?.category, region: location?.region }; }) });
  }
  results.push(languages);
}
await model.dispose();
const report = { model_id: CLIP_MODEL_ID, revision: CLIP_MODEL_REVISION, dtype: CLIP_MODEL_DTYPE, dimension: 512,
  locations: catalog.locations.length, images: output.items.length, load_ms: loadMs,
  model_file_bytes_observed: downloadedBytes, rss_bytes: process.memoryUsage().rss,
  note: "Small qualitative feasibility probe, not a labelled relevance benchmark or mobile measurement.", results };
await writeFile(process.argv[2] ?? "data-work/text-retrieval-probe.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(`Text probe: pairs=${results.length}, load_ms=${Math.round(loadMs)}, bytes=${downloadedBytes}, report=${process.argv[2] ?? "data-work/text-retrieval-probe.json"}`);
