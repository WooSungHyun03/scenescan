import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  rankLocationImageHits,
  type ImageSimilarityHit,
  type LocationScoreAggregation,
} from "../../src/domains/locations/services/location-ranking.ts";

const categorySchema = z.enum(["urban", "nature", "industrial", "interior"]);
const hitSchema = z.object({
  location_image_id: z.string().trim().min(1),
  location_id: z.string().trim().min(1),
  similarity: z.number().finite().min(-1).max(1),
}).strict();
const querySchema = z.object({
  query_id: z.string().trim().min(1),
  category: categorySchema,
  reference_image_path: z.string().trim().min(1),
  expected_location_ids: z.array(z.string().trim().min(1)).min(1),
  qualitative_note: z.string().trim().min(1),
  hits: z.array(hitSchema).min(1),
}).strict();
const datasetSchema = z.object({
  schema_version: z.literal(1),
  name: z.string().trim().min(1),
  provenance: z.object({
    kind: z.literal("synthetic"),
    license: z.string().trim().min(1),
    source_url: z.string().url(),
    score_origin: z.enum(["curated-ranking-scenario", "clip-cosine"]),
    model: z.object({
      id: z.string().trim().min(1),
      revision: z.string().trim().min(1),
      embedding_dimension: z.number().int().positive(),
      transformers_js_version: z.string().trim().min(1),
    }).strict().optional(),
  }).strict(),
  queries: z.array(querySchema).min(1),
}).strict();

export type RetrievalEvaluationDataset = z.infer<typeof datasetSchema>;
export type RetrievalEvaluationQuery = RetrievalEvaluationDataset["queries"][number];

export type EvaluationConfiguration = {
  name: string;
  aggregation: LocationScoreAggregation;
  minimumSimilarity: number;
};

export type QueryEvaluation = {
  queryId: string;
  category: RetrievalEvaluationQuery["category"];
  expectedLocationIds: string[];
  rankedLocationIds: string[];
  firstRelevantRank: number | null;
  hits: { top1: boolean; top3: boolean; top5: boolean };
  recall: { at1: number; at3: number; at5: number };
};

export type RetrievalEvaluationResult = {
  configuration: EvaluationConfiguration;
  queryCount: number;
  metrics: {
    top1: number;
    top3: number;
    top5: number;
    recallAt1: number;
    recallAt3: number;
    recallAt5: number;
    meanReciprocalRank: number;
    emptyResultRate: number;
  };
  byCategory: Record<RetrievalEvaluationQuery["category"], {
    queryCount: number;
    top1: number;
    top3: number;
    top5: number;
  }>;
  queries: QueryEvaluation[];
};

export const DEFAULT_EVALUATION_CONFIGURATIONS: EvaluationConfiguration[] = [
  { name: "max / threshold 0.00", aggregation: { strategy: "max" }, minimumSimilarity: 0 },
  { name: "max / threshold 0.50", aggregation: { strategy: "max" }, minimumSimilarity: 0.5 },
  { name: "max / threshold 0.75", aggregation: { strategy: "max" }, minimumSimilarity: 0.75 },
  { name: "top-2 mean / threshold 0.00", aggregation: { strategy: "top-k-mean", k: 2 }, minimumSimilarity: 0 },
  { name: "top-2 mean / threshold 0.50", aggregation: { strategy: "top-k-mean", k: 2 }, minimumSimilarity: 0.5 },
  { name: "top-2 mean / threshold 0.75", aggregation: { strategy: "top-k-mean", k: 2 }, minimumSimilarity: 0.75 },
];

function rejectDuplicates(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function parseEvaluationDataset(value: unknown): RetrievalEvaluationDataset {
  const dataset = datasetSchema.parse(value);
  if (dataset.provenance.score_origin === "clip-cosine" && !dataset.provenance.model) {
    throw new Error("CLIP cosine evaluation requires model provenance");
  }
  rejectDuplicates(dataset.queries.map((query) => query.query_id), "query_id");
  for (const query of dataset.queries) {
    rejectDuplicates(query.expected_location_ids, `expected location in ${query.query_id}`);
    rejectDuplicates(query.hits.map((hit) => hit.location_image_id), `location_image_id in ${query.query_id}`);
    const candidateLocations = new Set(query.hits.map((hit) => hit.location_id));
    const absentExpected = query.expected_location_ids.find((locationId) => !candidateLocations.has(locationId));
    if (absentExpected) {
      throw new Error(`Expected location ${absentExpected} has no candidate hit in ${query.query_id}`);
    }
  }
  return dataset;
}

function hitRate(queryResults: readonly QueryEvaluation[], key: keyof QueryEvaluation["hits"]): number {
  return queryResults.filter((result) => result.hits[key]).length / queryResults.length;
}

function mean(queryResults: readonly QueryEvaluation[], select: (result: QueryEvaluation) => number): number {
  return queryResults.reduce((sum, result) => sum + select(result), 0) / queryResults.length;
}

function evaluateQuery(query: RetrievalEvaluationQuery, configuration: EvaluationConfiguration): QueryEvaluation {
  const hits: ImageSimilarityHit[] = query.hits.map((hit) => ({
    locationImageId: hit.location_image_id,
    locationId: hit.location_id,
    similarity: hit.similarity,
  }));
  const rankedLocationIds = rankLocationImageHits(hits, {
    aggregation: configuration.aggregation,
    minimumSimilarity: configuration.minimumSimilarity,
    limit: 8,
  }).map((result) => result.locationId);
  const expected = new Set(query.expected_location_ids);
  const firstRelevantIndex = rankedLocationIds.findIndex((locationId) => expected.has(locationId));
  const recallAt = (k: number) => (
    rankedLocationIds.slice(0, k).filter((locationId) => expected.has(locationId)).length / expected.size
  );
  return {
    queryId: query.query_id,
    category: query.category,
    expectedLocationIds: [...query.expected_location_ids],
    rankedLocationIds,
    firstRelevantRank: firstRelevantIndex < 0 ? null : firstRelevantIndex + 1,
    hits: {
      top1: firstRelevantIndex >= 0 && firstRelevantIndex < 1,
      top3: firstRelevantIndex >= 0 && firstRelevantIndex < 3,
      top5: firstRelevantIndex >= 0 && firstRelevantIndex < 5,
    },
    recall: { at1: recallAt(1), at3: recallAt(3), at5: recallAt(5) },
  };
}

export function evaluateRetrieval(
  dataset: RetrievalEvaluationDataset,
  configuration: EvaluationConfiguration,
): RetrievalEvaluationResult {
  if (!configuration.name.trim()) throw new Error("Evaluation configuration name is required");
  const queries = dataset.queries.map((query) => evaluateQuery(query, configuration));
  const categories = categorySchema.options;
  const byCategory = Object.fromEntries(categories.map((category) => {
    const results = queries.filter((query) => query.category === category);
    return [category, {
      queryCount: results.length,
      top1: results.length === 0 ? 0 : hitRate(results, "top1"),
      top3: results.length === 0 ? 0 : hitRate(results, "top3"),
      top5: results.length === 0 ? 0 : hitRate(results, "top5"),
    }];
  })) as RetrievalEvaluationResult["byCategory"];

  return {
    configuration,
    queryCount: queries.length,
    metrics: {
      top1: hitRate(queries, "top1"),
      top3: hitRate(queries, "top3"),
      top5: hitRate(queries, "top5"),
      recallAt1: mean(queries, (query) => query.recall.at1),
      recallAt3: mean(queries, (query) => query.recall.at3),
      recallAt5: mean(queries, (query) => query.recall.at5),
      meanReciprocalRank: mean(queries, (query) => query.firstRelevantRank === null ? 0 : 1 / query.firstRelevantRank),
      emptyResultRate: queries.filter((query) => query.rankedLocationIds.length === 0).length / queries.length,
    },
    byCategory,
    queries,
  };
}

export function compareRetrievalConfigurations(
  dataset: RetrievalEvaluationDataset,
  configurations: readonly EvaluationConfiguration[] = DEFAULT_EVALUATION_CONFIGURATIONS,
): RetrievalEvaluationResult[] {
  rejectDuplicates(configurations.map((configuration) => configuration.name), "configuration name");
  return configurations.map((configuration) => evaluateRetrieval(dataset, configuration));
}

export async function verifyEvaluationReferenceImages(
  dataset: RetrievalEvaluationDataset,
  rootDirectory = process.cwd(),
): Promise<void> {
  for (const query of dataset.queries) {
    try {
      await access(resolve(rootDirectory, query.reference_image_path));
    } catch {
      throw new Error(`Missing reference image for ${query.query_id}: ${query.reference_image_path}`);
    }
  }
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatEvaluationReport(dataset: RetrievalEvaluationDataset, results: RetrievalEvaluationResult[]): string {
  const lines = [
    `Dataset: ${dataset.name} (${dataset.queries.length} queries, ${dataset.provenance.score_origin}, ${dataset.provenance.license})`,
    "",
    "configuration | Top-1 | Top-3 | Top-5 | Recall@1 | Recall@3 | Recall@5 | MRR | empty",
    "--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
  ];
  for (const result of results) {
    const metric = result.metrics;
    lines.push([
      result.configuration.name,
      percentage(metric.top1),
      percentage(metric.top3),
      percentage(metric.top5),
      percentage(metric.recallAt1),
      percentage(metric.recallAt3),
      percentage(metric.recallAt5),
      metric.meanReciprocalRank.toFixed(3),
      percentage(metric.emptyResultRate),
    ].join(" | "));
  }
  const baseline = results[0];
  if (baseline) {
    lines.push("", "Baseline by category:");
    for (const [category, metrics] of Object.entries(baseline.byCategory)) {
      lines.push(`- ${category} (${metrics.queryCount}): Top-1=${percentage(metrics.top1)}, Top-3=${percentage(metrics.top3)}, Top-5=${percentage(metrics.top5)}`);
    }
    const failures = baseline.queries.filter((query) => !query.hits.top1);
    lines.push("", `Baseline Top-1 failures (${failures.length}):`);
    for (const failure of failures) {
      lines.push(`- ${failure.queryId}: expected=${failure.expectedLocationIds.join(",")}; ranked=${failure.rankedLocationIds.join(",") || "empty"}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const datasetPath = resolve(process.argv[2] ?? "scripts/embeddings/evaluation-dataset.json");
  const dataset = parseEvaluationDataset(JSON.parse(await readFile(datasetPath, "utf8")));
  await verifyEvaluationReferenceImages(dataset);
  console.log(formatEvaluationReport(dataset, compareRetrievalConfigurations(dataset)));
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
