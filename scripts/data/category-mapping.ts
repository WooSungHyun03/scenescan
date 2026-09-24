import type { LocationCategory } from "../../src/types/domain.ts";

export const LOCATION_CATEGORY_TABLE = Object.freeze({
  urban: "urban",
  "도시": "urban",
  nature: "nature",
  "자연": "nature",
  industrial: "industrial",
  "산업": "industrial",
  interior: "interior",
  "실내": "interior",
} satisfies Readonly<Record<string, LocationCategory>>);

export type CategoryReviewReason = "MISSING_CATEGORY" | "INVALID_CATEGORY" | "UNKNOWN_CATEGORY";

export type CategoryMappingResult =
  | {
    status: "mapped";
    sourceCategory: string;
    normalizedSourceCategory: string;
    category: LocationCategory;
    matchedBy: "source-map" | "common-table";
  }
  | {
    status: "review";
    sourceCategory: string | null;
    normalizedSourceCategory: string | null;
    reason: CategoryReviewReason;
  };

export function normalizeSourceCategoryKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function sourceCategoryText(value: unknown): CategoryMappingResult | string {
  if (value === undefined || value === null || value === "") {
    return {
      status: "review",
      sourceCategory: null,
      normalizedSourceCategory: null,
      reason: "MISSING_CATEGORY",
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") {
    return {
      status: "review",
      sourceCategory: null,
      normalizedSourceCategory: null,
      reason: "INVALID_CATEGORY",
    };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {
      status: "review",
      sourceCategory: null,
      normalizedSourceCategory: null,
      reason: "MISSING_CATEGORY",
    };
  }
  return trimmed;
}

function normalizedSourceMap(
  mapping: Readonly<Record<string, LocationCategory>>,
): Map<string, LocationCategory> {
  const normalized = new Map<string, LocationCategory>();
  for (const [sourceCategory, category] of Object.entries(mapping)) {
    const key = normalizeSourceCategoryKey(sourceCategory);
    if (key.length === 0) throw new Error("Category mapping keys must not be blank");
    const existing = normalized.get(key);
    if (existing && existing !== category) {
      throw new Error(`Conflicting category mappings for normalized source category "${key}"`);
    }
    normalized.set(key, category);
  }
  return normalized;
}

export function mapLocationCategory(
  value: unknown,
  sourceMapping: Readonly<Record<string, LocationCategory>> = {},
): CategoryMappingResult {
  const sourceCategory = sourceCategoryText(value);
  if (typeof sourceCategory !== "string") return sourceCategory;

  const normalizedSourceCategory = normalizeSourceCategoryKey(sourceCategory);
  const sourceCategoryMap = normalizedSourceMap(sourceMapping);
  const sourceMapped = sourceCategoryMap.get(normalizedSourceCategory);
  if (sourceMapped) {
    return {
      status: "mapped",
      sourceCategory,
      normalizedSourceCategory,
      category: sourceMapped,
      matchedBy: "source-map",
    };
  }

  const commonMapped = LOCATION_CATEGORY_TABLE[
    normalizedSourceCategory as keyof typeof LOCATION_CATEGORY_TABLE
  ];
  if (commonMapped) {
    return {
      status: "mapped",
      sourceCategory,
      normalizedSourceCategory,
      category: commonMapped,
      matchedBy: "common-table",
    };
  }

  return {
    status: "review",
    sourceCategory,
    normalizedSourceCategory,
    reason: "UNKNOWN_CATEGORY",
  };
}
