import type { District, LocationCategory } from "@/types/domain";
import { DISTRICT_LABELS } from "@/types/location-options";

/**
 * Curated, rule-based lookup tables for POST /api/search/text's natural-
 * language parser (src/domains/search/server/text-query-parser.ts). No
 * external AI is involved -- every mapping here is a reviewed fact, not a
 * guess, and this file is the single place to add or correct one.
 *
 * HOW TO ADD AN ALIAS:
 * - A new neighborhood/landmark name that should resolve to a district:
 *   add one entry to NEIGHBORHOOD_DISTRICT_ALIASES below, e.g.
 *   ["해동", "busan_haeundae_gu"] -- verify the real-world mapping first
 *   (see the review note on that list); never add a guess.
 * - The 16 district labels themselves (e.g. "해운대구") and their
 *   "-구"/"-군"-stripped short forms (e.g. "해운대") are generated
 *   automatically from DISTRICT_LABELS (src/types/location-options.ts) --
 *   do not hand-list them here, and do not create a second district list
 *   anywhere else; DISTRICT_LABELS remains the single source of truth for
 *   the 16 keys themselves.
 * - A new category synonym: add to CATEGORY_ALIASES.
 * - A new "cannot be verified from data" phrase (e.g. a mood/condition):
 *   add to UNSUPPORTED_CONDITION_PHRASES.
 */

// Reviewed Busan neighborhood/landmark names that are well-known public
// facts but don't literally match a district label (unlike e.g. "영도" for
// 영도구, which the automatic -구/-군-stripping below already covers).
// Keep this list small and only add entries that are common knowledge and
// easy to verify (e.g. against an official tourism/administrative map) --
// an acceptable "검수된 별칭" is the bar, not a convenient guess.
const NEIGHBORHOOD_DISTRICT_ALIASES: ReadonlyArray<readonly [string, District]> = [
  ["광안리", "busan_suyeong_gu"], // Gwangalli Beach
  ["서면", "busan_busanjin_gu"], // Seomyeon
  ["전포", "busan_busanjin_gu"], // Jeonpo-dong cafe street
  ["남포동", "busan_jung_gu"], // Nampo-dong
  ["자갈치", "busan_jung_gu"], // Jagalchi Market
  ["감천", "busan_saha_gu"], // Gamcheon Culture Village
  ["다대포", "busan_saha_gu"], // Dadaepo Beach
  ["송정", "busan_haeundae_gu"], // Songjeong Beach
  ["센텀시티", "busan_haeundae_gu"], // Centum City
  ["태종대", "busan_yeongdo_gu"], // Taejongdae
];

// Never returns a 1-character result: stripping "중구"/"서구"/"동구"/
// "남구"/"북구" down to "중"/"서"/"동"/"남"/"북" would register an alias
// that matches as a substring of huge amounts of unrelated Korean text
// (동/서/남/북 are common directional words; 중 is extremely common) --
// caught by manually exercising the route against the dev server (a
// "광안리 산책" query incorrectly resolving a "nature" category from a
// similarly too-short category alias, see CATEGORY_ALIASES), not by a unit
// test. Those 5 districts are matched only by their full label ("중구",
// not "중") -- see the REGION_VALUES-collision comment in
// src/types/location-options.ts for why they needed a disambiguating
// prefix in the first place.
function stripDistrictSuffix(label: string): string | null {
  if (!label.endsWith("구") && !label.endsWith("군")) return null;
  const short = label.slice(0, -1);
  return short.length >= 2 ? short : null;
}

function buildDistrictAliases(): ReadonlyMap<string, District> {
  const aliases = new Map<string, District>();
  for (const [district, label] of Object.entries(DISTRICT_LABELS) as [District, string][]) {
    aliases.set(label, district); // e.g. "해운대구" -> busan_haeundae_gu
    const short = stripDistrictSuffix(label);
    if (short) aliases.set(short, district); // e.g. "해운대" -> busan_haeundae_gu
  }
  for (const [alias, district] of NEIGHBORHOOD_DISTRICT_ALIASES) {
    if (!aliases.has(alias)) aliases.set(alias, district);
  }
  return aliases;
}

// alias string -> District. Includes every district's full label, its
// short form, and the curated neighborhood list above.
export const DISTRICT_ALIASES: ReadonlyMap<string, District> = buildDistrictAliases();

// Category extraction stays deliberately literal-first: the 4 catalog
// categories (urban/nature/industrial/interior) are broad spatial types,
// not venue types ("카페", "맛집", etc. stay as plain keywords matched
// against tags/description instead of being force-mapped onto one of the
// 4). Only add a synonym here when it unambiguously means one of the 4 --
// and never a single character: a 1-char alias matches as a substring of
// many unrelated words (e.g. a since-removed "산" -> nature entry
// incorrectly matched inside "산책" ["walk"], "계산" ["calculation"], etc.
// -- caught by manually exercising this route against the dev server, not
// by a unit test, since every unit test used words that happened not to
// collide).
export const CATEGORY_ALIASES: ReadonlyMap<string, LocationCategory> = new Map([
  ["도시", "urban"],
  ["도심", "urban"],
  ["거리", "urban"],
  ["자연", "nature"],
  ["바다", "nature"],
  ["해변", "nature"],
  ["등산", "nature"],
  ["공원", "nature"],
  ["산업", "industrial"],
  ["공장", "industrial"],
  ["창고", "industrial"],
  ["실내", "interior"],
  ["스튜디오", "interior"],
]);

// Korean names for the other 16 first-level regions, for the "부산 외 지역
//요청" short-circuit (requirement 7). A simple substring scan against this
// list, not an exhaustive gazetteer -- common long forms ("서울특별시")
// already contain the short form ("서울") as a substring, so no extra
// entries are needed for those.
export const OUT_OF_BUSAN_REGION_KEYWORDS: readonly string[] = [
  "서울", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

// Phrases describing a condition the catalog has no verified data for.
// Detected and reported via `unsupportedConditions`, but never used to
// filter or score results, and never implied as satisfied by any result
// (see docs/api-contracts.md). Kept intentionally small; extend as real
// user queries surface more of these.
export const UNSUPPORTED_CONDITION_PHRASES: readonly string[] = [
  "조용한", "조용함", "한적한", "인적이 드문", "사람이 없는", "사람 없는", "아무도 없는",
  "촬영 가능", "촬영가능", "촬영 허가", "촬영허가",
  "주차 가능", "주차가능",
];

// Korean particles/filler words stripped from the leftover text before it
// becomes free-text keywords, so e.g. "해운대 느낌 나는 곳" doesn't search
// for the literal word "곳". Deliberately small and token-exact (not a
// morphological analyzer) -- a token that merely *contains* one of these
// as a substring is left alone.
export const KEYWORD_STOPWORDS: ReadonlySet<string> = new Set([
  "은", "는", "이", "가", "을", "를", "의", "에", "에서", "로", "으로", "와", "과",
  "도", "만", "좀", "좀더", "있는", "있나요", "있어요", "찾아줘", "찾아주세요",
  "추천", "추천해줘", "알려줘", "곳", "장소", "어디", "근처", "쪽",
]);
