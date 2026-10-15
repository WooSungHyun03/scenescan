import type { District, LocationCategory } from "@/types/domain";
import type { ParsedTextSearchQuery } from "@/types/text-search";
import { uniqueSearchKeywords } from "../../../shared/text/search-keywords.ts";
import {
  CATEGORY_ALIASES,
  DISTRICT_ALIASES,
  KEYWORD_STOPWORDS,
  OUT_OF_BUSAN_REGION_KEYWORDS,
  UNSUPPORTED_CONDITION_PHRASES,
} from "./text-search-aliases.ts";

/**
 * Rule-based natural-language extraction for POST /api/search/text --
 * no external AI, no model call. Every mapping it relies on lives in the
 * reviewed dictionary (text-search-aliases.ts); this file only applies it.
 * Pure and synchronous so it is unit-testable without a database.
 */

const TOKEN_SPLIT_PATTERN = /[\s,./!?~\-"'`()[\]{}]+/u;

function stripAllOccurrences(text: string, needle: string): string {
  return text.split(needle).join(" ");
}

// Removes every alias key found in `text` (longest key first, so e.g.
// "해운대구" is consumed whole before the shorter "해운대" alias would
// otherwise leave a stray "구" token behind) and returns both the
// remaining text and the distinct set of values those aliases mapped to.
function extractAndStrip<T>(text: string, aliases: ReadonlyMap<string, T>): { remaining: string; matched: T[] } {
  const orderedKeys = [...aliases.keys()].sort((a, b) => b.length - a.length);
  let remaining = text;
  const matched: T[] = [];
  const seen = new Set<T>();
  for (const key of orderedKeys) {
    // The short district alias 기장 must not consume the end of 경기장.
    // Other occurrences (e.g. "기장군 경기장") remain eligible.
    const venueSafeAlias = key === "기장" ? /(?<!경)기장/gu : null;
    if (venueSafeAlias && !venueSafeAlias.test(remaining)) continue;
    if (!remaining.includes(key)) continue;
    remaining = venueSafeAlias ? remaining.replace(venueSafeAlias, " ") : stripAllOccurrences(remaining, key);
    const value = aliases.get(key)!;
    if (!seen.has(value)) {
      seen.add(value);
      matched.push(value);
    }
  }
  return { remaining, matched };
}

function toKeywords(text: string): string[] {
  return uniqueSearchKeywords(text
    .split(TOKEN_SPLIT_PATTERN)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !KEYWORD_STOPWORDS.has(token)));
}

export function parseTextSearchQuery(rawQuery: string): ParsedTextSearchQuery {
  const normalized = rawQuery.trim();

  // A reviewed Busan alias can contain another region's name:
  // "해운대구" includes "대구". Resolve aliases before scope detection,
  // while retaining all other text so mixed-region requests still fail closed.
  // 경기장 is a venue noun, not a request for 경기 province. Keep it in
  // actual search keywords, but do not let its substring reject 부산 venues.
  const scopeText = extractAndStrip(normalized, DISTRICT_ALIASES).remaining.replaceAll("경기장", " ");

  // Requirement 7: a non-Busan region mention short-circuits everything
  // else -- never partially honor a mixed "서울이랑 해운대" query.
  if (OUT_OF_BUSAN_REGION_KEYWORDS.some((region) => scopeText.includes(region))) {
    return {
      district: null,
      category: null,
      keywords: [],
      districtConflict: false,
      conflictingDistricts: [],
      outOfScope: true,
      unsupportedConditions: [],
    };
  }

  // Normalize only this explicit Korean sightline construction, not arbitrary
  // trailing particles in names. Metadata can match the noun but cannot prove
  // visibility from a shooting position, so retain the literal condition too.
  const sightlineNouns: string[] = [];
  const sightlineConditions: string[] = [];
  const withoutSightlineGrammar = normalized.replace(/([\p{L}\p{N}]+?)(?:이|가)\s+보이는/gu, (phrase, noun: string) => {
    sightlineNouns.push(noun);
    sightlineConditions.push(phrase);
    return noun;
  });

  // Strip unsupported-condition phrases first so they never leak into the
  // keyword list and never coincidentally drive a text match (requirement 6).
  const conditionMap = new Map(UNSUPPORTED_CONDITION_PHRASES.map((phrase) => [phrase, phrase] as const));
  const { remaining: afterConditions, matched: unsupportedConditions } = extractAndStrip(withoutSightlineGrammar, conditionMap);

  const { remaining: afterDistrict, matched: districtMatches } = extractAndStrip(afterConditions, DISTRICT_ALIASES);
  const districtConflict = districtMatches.length > 1;

  const { remaining: afterCategory, matched: categoryMatches } = extractAndStrip(afterDistrict, CATEGORY_ALIASES);

  return {
    district: districtConflict ? null : ((districtMatches[0] as District | undefined) ?? null),
    category: (categoryMatches[0] as LocationCategory | undefined) ?? null,
    // A category alias (e.g. 바다) must not erase the explicit sightline noun.
    keywords: uniqueSearchKeywords([...toKeywords(afterCategory), ...sightlineNouns]),
    districtConflict,
    conflictingDistricts: districtConflict ? districtMatches : [],
    outOfScope: false,
    unsupportedConditions: [...new Set([...unsupportedConditions, ...sightlineConditions])],
  };
}
