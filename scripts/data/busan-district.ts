import type { District } from "../../src/types/domain.ts";
import { DISTRICT_LABELS, DISTRICT_VALUES } from "../../src/types/location-options.ts";

/**
 * Determines a candidate's Busan 구/군 (requirement 2: "좌표와 주소로
 * 구·군을 판정하고, 불일치·불명확하면 district를 비우고 검수 목록으로
 * 분리한다. 임의 배정 금지."). Never invents per-district boundary
 * geometry -- there is no reviewed district-polygon dataset in this repo,
 * and hand-authoring precise centroid coordinates here would itself be the
 * kind of unverified guess this requirement exists to prevent. Instead:
 *
 * 1. The coordinate is checked only against a wide, well-known Busan
 *    *city*-level bounding box (not per-district) -- a coarse sanity
 *    check that the point is plausibly within Busan at all, not an
 *    authority for which district it's in.
 * 2. The actual district comes from matching DISTRICT_LABELS (the single
 *    1차 definition, src/types/location-options.ts) against the address
 *    string -- Korean addresses carry the 구/군 as a mandatory
 *    administrative segment, so this is reading an authoritative field the
 *    source already provided, not inferring one. The same short-form
 *    safety rule src/domains/search/server/text-search-aliases.ts and
 *    scripts/nvidia/evaluate-intent.ts both already use applies here too:
 *    a "-구"/"-군"-stripped short form only counts as a match when it is
 *    at least 2 characters (중구/서구/동구/남구/북구's 1-character short
 *    forms would false-positive-match almost any address).
 *
 * Any ambiguity (zero or multiple district matches in the address, or a
 * coordinate outside the Busan bounding box) returns `district: null`
 * with a specific reason -- the caller is expected to route that result to
 * a manual-review list rather than publish a guessed district.
 */

// Deliberately coarse and city-wide (not per-district): Busan's own
// published administrative extent, rounded outward for safety margin.
// Source: Busan Metropolitan City's own public extent (35.0~35.4N,
// 128.7~129.3E is the commonly cited range); rounded further out here so
// this check only ever rejects coordinates clearly outside the city, never
// a borderline in-city point near an edge.
export const BUSAN_CITY_BOUNDS = {
  minLatitude: 34.86,
  maxLatitude: 35.42,
  minLongitude: 128.68,
  maxLongitude: 129.36,
} as const;

export type BusanDistrictResolution =
  | { district: District; status: "resolved"; reason: "ADDRESS_MATCH" }
  | {
    district: null;
    status: "needs-review";
    reason: "COORDINATE_OUTSIDE_BUSAN" | "NO_DISTRICT_IN_ADDRESS" | "MULTIPLE_DISTRICTS_IN_ADDRESS";
    matchedDistricts?: District[];
  };

export type BusanDistrictInput = {
  address: string;
  latitude: number;
  longitude: number;
};

// Short forms excluded even at 2+ characters because they collide with an
// unrelated, common Korean word rather than a different district's name --
// "기장" (기장군's short form) is also the tail of "경기장" (stadium/sports
// ground), a word that recurs constantly in facility names/descriptions
// (e.g. "부산아시아드주경기장" wrongly matched 기장군 this way before this
// exclusion was added). Found empirically while judging real round-1 data,
// not a hypothetical case.
const AMBIGUOUS_SHORT_FORMS = new Set(["기장"]);

function districtAliasesFor(district: District): string[] {
  const label = DISTRICT_LABELS[district];
  const shortForm = label.replace(/(구|군)$/u, "");
  return shortForm.length >= 2 && !AMBIGUOUS_SHORT_FORMS.has(shortForm) ? [label, shortForm] : [label];
}

function isWithinBusanBounds(latitude: number, longitude: number): boolean {
  return latitude >= BUSAN_CITY_BOUNDS.minLatitude
    && latitude <= BUSAN_CITY_BOUNDS.maxLatitude
    && longitude >= BUSAN_CITY_BOUNDS.minLongitude
    && longitude <= BUSAN_CITY_BOUNDS.maxLongitude;
}

export function resolveBusanDistrict(input: BusanDistrictInput): BusanDistrictResolution {
  if (!isWithinBusanBounds(input.latitude, input.longitude)) {
    return { district: null, status: "needs-review", reason: "COORDINATE_OUTSIDE_BUSAN" };
  }

  // Longest-alias-first, strip-as-you-go -- the same algorithm
  // text-query-parser.ts's extractAndStrip uses, and for the same reason:
  // "강서구" (busan_gangseo_gu) contains "서구" (busan_seo_gu) as a literal
  // substring, so checking aliases in an arbitrary order would wrongly
  // report both districts for an address that only names 강서구. Matching
  // the longest alias first and removing it from the working text before
  // checking shorter ones avoids that false collision.
  let remaining = input.address;
  const matched: District[] = [];
  const aliasesByLengthDescending = DISTRICT_VALUES
    .flatMap((district) => districtAliasesFor(district).map((alias) => ({ district, alias })))
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { district, alias } of aliasesByLengthDescending) {
    if (!remaining.includes(alias)) continue;
    if (!matched.includes(district)) matched.push(district);
    remaining = remaining.split(alias).join(" ");
  }

  if (matched.length === 0) {
    return { district: null, status: "needs-review", reason: "NO_DISTRICT_IN_ADDRESS" };
  }
  if (matched.length > 1) {
    return { district: null, status: "needs-review", reason: "MULTIPLE_DISTRICTS_IN_ADDRESS", matchedDistricts: matched };
  }
  return { district: matched[0], status: "resolved", reason: "ADDRESS_MATCH" };
}
