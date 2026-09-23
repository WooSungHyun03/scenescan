export interface ImageSimilarityHit {
  locationImageId: string;
  locationId: string;
  similarity: number;
}

export type LocationScoreAggregation =
  | { strategy: "max" }
  | { strategy: "top-k-mean"; k: number };

export interface LocationRankingOptions {
  aggregation?: LocationScoreAggregation;
  eligibleLocationIds?: ReadonlySet<string>;
  limit?: number;
  minimumSimilarity?: number;
}

export interface RankedLocationHit {
  locationId: string;
  matchedImageId: string;
  similarity: number;
  contributingImageCount: number;
}

const DEFAULT_LIMIT = 8;
const DEFAULT_MINIMUM_SIMILARITY = 0;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateOptions(options: LocationRankingOptions): Required<Pick<LocationRankingOptions, "aggregation" | "limit" | "minimumSimilarity">> {
  const aggregation = options.aggregation ?? { strategy: "max" };
  const limit = options.limit ?? DEFAULT_LIMIT;
  const minimumSimilarity = options.minimumSimilarity ?? DEFAULT_MINIMUM_SIMILARITY;
  if (!Number.isInteger(limit) || limit < 0 || limit > 200) {
    throw new Error("Ranking limit must be an integer between 0 and 200");
  }
  if (!Number.isFinite(minimumSimilarity) || minimumSimilarity < -1 || minimumSimilarity > 1) {
    throw new Error("Minimum similarity must be finite and between -1 and 1");
  }
  if (aggregation.strategy === "top-k-mean" && (!Number.isInteger(aggregation.k) || aggregation.k < 1)) {
    throw new Error("top-k-mean k must be a positive integer");
  }
  return { aggregation, limit, minimumSimilarity };
}

function isUsableHit(
  hit: ImageSimilarityHit,
  minimumSimilarity: number,
  eligibleLocationIds?: ReadonlySet<string>,
): boolean {
  return hit.locationId.trim().length > 0
    && hit.locationImageId.trim().length > 0
    && Number.isFinite(hit.similarity)
    && hit.similarity >= -1
    && hit.similarity <= 1
    && hit.similarity >= minimumSimilarity
    && (eligibleLocationIds === undefined || eligibleLocationIds.has(hit.locationId));
}

function deduplicateImages(hits: ImageSimilarityHit[]): ImageSimilarityHit[] {
  const byImage = new Map<string, ImageSimilarityHit>();
  for (const hit of hits) {
    const previous = byImage.get(hit.locationImageId);
    if (!previous || hit.similarity > previous.similarity) byImage.set(hit.locationImageId, hit);
  }
  return [...byImage.values()].sort(
    (left, right) => right.similarity - left.similarity || compareText(left.locationImageId, right.locationImageId),
  );
}

function aggregateLocation(hits: ImageSimilarityHit[], aggregation: LocationScoreAggregation): RankedLocationHit {
  const rankedImages = deduplicateImages(hits);
  const contributingImageCount = aggregation.strategy === "max"
    ? 1
    : Math.min(aggregation.k, rankedImages.length);
  const similarity = aggregation.strategy === "max"
    ? rankedImages[0].similarity
    : rankedImages.slice(0, contributingImageCount)
      .reduce((sum, hit) => sum + hit.similarity, 0) / contributingImageCount;
  return {
    locationId: rankedImages[0].locationId,
    matchedImageId: rankedImages[0].locationImageId,
    similarity,
    contributingImageCount,
  };
}

export function rankLocationImageHits(
  hits: readonly ImageSimilarityHit[],
  options: LocationRankingOptions = {},
): RankedLocationHit[] {
  const { aggregation, limit, minimumSimilarity } = validateOptions(options);
  if (limit === 0) return [];
  const byLocation = new Map<string, ImageSimilarityHit[]>();
  for (const hit of hits) {
    if (!isUsableHit(hit, minimumSimilarity, options.eligibleLocationIds)) continue;
    const locationHits = byLocation.get(hit.locationId);
    if (locationHits) locationHits.push(hit);
    else byLocation.set(hit.locationId, [hit]);
  }
  return [...byLocation.values()]
    .map((locationHits) => aggregateLocation(locationHits, aggregation))
    .sort((left, right) => right.similarity - left.similarity || compareText(left.locationId, right.locationId))
    .slice(0, limit);
}
