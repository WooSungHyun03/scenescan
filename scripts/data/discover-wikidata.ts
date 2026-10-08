import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { LocationCategory } from "../../src/types/domain.ts";
import { LOCATION_CATEGORY_VALUES } from "../../src/types/location-options.ts";
import { KOREA_REGION_VALUES, type KoreaRegion } from "./contracts.ts";
import {
  fetchCommonsMetadataSettled,
  parseCollectionManifest,
} from "./collect-commons.ts";
import {
  coverageCellKey,
  createCoverageReport,
  MINIMUM_LOCATIONS_PER_CELL,
  type CoverageCell,
  type CoverageLocation,
  type CoverageReport,
} from "./coverage.ts";

const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const USER_AGENT = "SceneScan/0.1 (open-source location dataset; https://github.com/WooSungHyun03/scenescan)";
const DATASET_NAMESPACE = "ca26f0ab-6294-4fbf-8c7f-d758c2cb66b4";

export const WIKIDATA_REGIONS: ReadonlyArray<{ id: string; region: KoreaRegion }> = [
  { id: "Q8684", region: "서울" },
  { id: "Q16520", region: "부산" },
  { id: "Q20927", region: "대구" },
  { id: "Q20934", region: "인천" },
  { id: "Q41283", region: "광주" },
  { id: "Q20921", region: "대전" },
  { id: "Q41278", region: "울산" },
  { id: "Q20929", region: "세종" },
  { id: "Q20937", region: "경기" },
  { id: "Q41071", region: "강원" },
  { id: "Q41066", region: "충북" },
  { id: "Q41070", region: "충남" },
  { id: "Q41157", region: "전북" },
  { id: "Q41161", region: "전남" },
  { id: "Q41154", region: "경북" },
  { id: "Q41151", region: "경남" },
  { id: "Q41164", region: "제주" },
] as const;

const UNSUITABLE_LOCATION_NAME = /(고등학교|중학교|초등학교|병원|사관학교|소방학교|소방서|경찰서|우체국|연구원|교도소|구치소)/;
const UNSUITABLE_LOCATION_TYPE = /(초등학교|중학교|고등학교|hospital|병원|fire station|소방서|police station|경찰서|prison|교도소|구치소|post office|우체국|research institute|연구원|administrative territorial entity|광역자치단체|특별자치시)/i;
const REGION_ENTITY_IDS = new Set(WIKIDATA_REGIONS.map(({ id }) => id));
const KOREA_COORDINATE_BOUNDS = {
  minimumLatitude: 32,
  maximumLatitude: 39.5,
  minimumLongitude: 124,
  maximumLongitude: 132,
} as const;
const MANUAL_REVIEW_CASES = [
  { kind: "temple", pattern: /(사찰|불교.*사원|temple|buddhist monastery|절$)/i },
  { kind: "park", pattern: /(공원|park)/i },
  { kind: "cave", pattern: /(동굴|굴$|cave)/i },
  { kind: "campus", pattern: /(캠퍼스|대학교|대학|university campus|college campus)/i },
  { kind: "mountain", pattern: /(산$|산맥|봉$|mountain|peak)/i },
  { kind: "river", pattern: /(강$|천$|하천|river|stream)/i },
  { kind: "island", pattern: /(도$|섬$|island)/i },
  { kind: "wetland", pattern: /(습지|wetland)/i },
  { kind: "tidal-flat", pattern: /(갯벌|tidal flats?|mudflats?)/i },
  { kind: "forest", pattern: /(숲$|forest)/i },
  { kind: "coast", pattern: /(해변|해수욕장|beach|coast)/i },
  { kind: "lake", pattern: /(호$|호수|저수지|lake|reservoir)/i },
  { kind: "waterfall", pattern: /(폭포|waterfall)/i },
  { kind: "trail", pattern: /(탐방로|산책로|둘레길|trail)/i },
] as const;
const REGION_ADDRESS_MARKERS: Record<KoreaRegion, readonly string[]> = {
  서울: ["서울", "Seoul"], 부산: ["부산", "Busan"], 대구: ["대구", "Daegu"],
  인천: ["인천", "Incheon"], 광주: ["광주", "Gwangju"], 대전: ["대전", "Daejeon"],
  울산: ["울산", "Ulsan"], 세종: ["세종", "Sejong"], 경기: ["경기", "Gyeonggi"],
  강원: ["강원", "Gangwon"], 충북: ["충청북", "충북", "Chungcheongbuk"],
  충남: ["충청남", "충남", "Chungcheongnam"], 전북: ["전북", "전라북", "Jeonbuk", "Jeollabuk"],
  전남: ["전라남", "전남", "Jeollanam"], 경북: ["경상북", "경북", "Gyeongsangbuk"],
  경남: ["경상남", "경남", "Gyeongsangnam"], 제주: ["제주", "Jeju"],
};
const CATEGORY_ROOTS = `
  (wd:Q22698 "nature") (wd:Q4421 "nature") (wd:Q8502 "nature")
  (wd:Q40080 "nature") (wd:Q4022 "nature") (wd:Q23442 "nature")
  (wd:Q23397 "nature") (wd:Q47521 "nature") (wd:Q12284 "nature")
  (wd:Q39614 "nature") (wd:Q43501 "nature") (wd:Q167346 "nature")
  (wd:Q131681 "nature") (wd:Q34038 "nature") (wd:Q170321 "nature")
  (wd:Q628179 "nature") (wd:Q35509 "nature")
  (wd:Q1662011 "industrial") (wd:Q83405 "industrial")
  (wd:Q1362225 "industrial") (wd:Q159719 "industrial")
  (wd:Q1248784 "industrial") (wd:Q44782 "industrial")
  (wd:Q820477 "industrial") (wd:Q190928 "industrial")
  (wd:Q1867977 "industrial") (wd:Q2069494 "industrial") (wd:Q188040 "industrial")
  (wd:Q33506 "interior") (wd:Q7075 "interior") (wd:Q24354 "interior")
  (wd:Q11315 "interior") (wd:Q483110 "interior")
  (wd:Q2281788 "interior") (wd:Q330284 "interior") (wd:Q27686 "interior")
  (wd:Q11707 "interior") (wd:Q5393308 "interior")
  (wd:Q41176 "urban") (wd:Q12280 "urban") (wd:Q55488 "urban")
  (wd:Q570116 "urban") (wd:Q811430 "urban") (wd:Q13226383 "urban")
  (wd:Q294440 "urban") (wd:Q34442 "urban") (wd:Q174782 "urban")
  (wd:Q79007 "urban") (wd:Q1076486 "urban") (wd:Q12518 "urban")
  (wd:Q4989906 "urban") (wd:Q839954 "urban") (wd:Q24398318 "urban")
  (wd:Q23413 "urban") (wd:Q3918 "urban") (wd:Q209465 "urban")
  (wd:Q16560 "urban")
`;

type BindingValue = { value?: unknown };
export type WikidataBinding = Record<string, BindingValue | undefined>;
export type Candidate = {
  qid: string;
  name: string;
  description: string;
  region: KoreaRegion;
  address: string;
  latitude: number;
  longitude: number;
  categories: Set<LocationCategory>;
  imageTitles: Set<string>;
  typeLabels: Set<string>;
  matchedRegions: Set<KoreaRegion>;
  addressesByRegion: Partial<Record<KoreaRegion, string>>;
};

export type CandidateReviewReason = "MULTIPLE_CATEGORIES" | "MULTIPLE_REGIONS" | "REPRESENTATIVE_CASE";

export type CandidateReviewItem = {
  qid: string;
  name: string;
  regions: KoreaRegion[];
  addressesByRegion: Partial<Record<KoreaRegion, string>>;
  latitude: number;
  longitude: number;
  categories: LocationCategory[];
  typeLabels: string[];
  representativeCases: string[];
  reasons: CandidateReviewReason[];
  sourceUrl: string;
};

export type PrioritizedCandidateReviewItem = CandidateReviewItem & {
  coverageCells: Array<Pick<CoverageCell, "region" | "category" | "count" | "target" | "deficit">>;
};

export type ReviewDecision = {
  qid: string;
  decision: "accept" | "reject";
  category: LocationCategory | null;
  region: KoreaRegion | null;
  note: string;
  reviewedBy: string;
  reviewedAt: string;
};

export type ReadyCandidate = Candidate & {
  category: LocationCategory;
  licensedImageTitles: string[];
};

export type SelectedCandidate = ReadyCandidate & { fileTitle: string };

function bindingText(binding: WikidataBinding, key: string): string | null {
  const value = binding[key]?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function deterministicUuid(name: string): string {
  const namespace = Buffer.from(DATASET_NAMESPACE.replaceAll("-", ""), "hex");
  const digest = createHash("sha1").update(namespace).update(name).digest().subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function commonsTitleFromSpecialFilePath(value: string): string {
  const url = new URL(value);
  const marker = "/wiki/Special:FilePath/";
  const markerIndex = url.pathname.indexOf(marker);
  if (url.hostname !== "commons.wikimedia.org" || markerIndex < 0) {
    throw new Error(`Unsupported Wikidata image URL: ${value}`);
  }
  const filename = decodeURIComponent(url.pathname.slice(markerIndex + marker.length)).replaceAll("_", " ").trim();
  if (!filename) throw new Error(`Wikidata image URL has no filename: ${value}`);
  return `File:${filename}`;
}

function parsePoint(value: string): { latitude: number; longitude: number } {
  const match = /^Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/.exec(value);
  if (!match) throw new Error(`Unsupported Wikidata coordinate: ${value}`);
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error(`Invalid coordinate: ${value}`);
  if (
    latitude < KOREA_COORDINATE_BOUNDS.minimumLatitude
    || latitude > KOREA_COORDINATE_BOUNDS.maximumLatitude
    || longitude < KOREA_COORDINATE_BOUNDS.minimumLongitude
    || longitude > KOREA_COORDINATE_BOUNDS.maximumLongitude
  ) {
    throw new Error(`Coordinate is outside South Korea bounds: ${value}`);
  }
  return { latitude, longitude };
}

function qidFromEntity(value: string): string {
  const match = /\/entity\/(Q\d+)$/.exec(value);
  if (!match) throw new Error(`Invalid Wikidata entity URL: ${value}`);
  return match[1];
}

export function collectCandidates(bindings: WikidataBinding[], region: KoreaRegion): Candidate[] {
  const candidates = new Map<string, Candidate>();
  for (const binding of bindings) {
    const item = bindingText(binding, "item");
    const name = bindingText(binding, "itemLabel");
    const sourceAddress = bindingText(binding, "address");
    const administrativeArea = bindingText(binding, "adminLabel");
    const address = sourceAddress ?? (administrativeArea ? `${region} ${administrativeArea}` : null);
    const point = bindingText(binding, "coord");
    const image = bindingText(binding, "image");
    const category = bindingText(binding, "category") as LocationCategory | null;
    const typeLabel = bindingText(binding, "typeLabel");
    if (!item || !name || !address || !point || !image || !category || !LOCATION_CATEGORY_VALUES.includes(category)) continue;
    if (UNSUITABLE_LOCATION_NAME.test(name)) continue;
    if (typeLabel && UNSUITABLE_LOCATION_TYPE.test(typeLabel)) continue;
    if (address.includes("[[") || !REGION_ADDRESS_MARKERS[region].some((marker) => address.toLocaleLowerCase().includes(marker.toLocaleLowerCase()))) continue;
    let qid: string;
    let coordinates: { latitude: number; longitude: number };
    let imageTitle: string;
    try {
      qid = qidFromEntity(item);
      if (REGION_ENTITY_IDS.has(qid)) continue;
      coordinates = parsePoint(point);
      imageTitle = commonsTitleFromSpecialFilePath(image);
    } catch {
      continue;
    }
    const candidate = candidates.get(qid) ?? {
      qid,
      name,
      description: bindingText(binding, "itemDescription") ?? `Wikidata에 등재된 ${region}의 장소입니다.`,
      region,
      address,
      ...coordinates,
      categories: new Set<LocationCategory>(),
      imageTitles: new Set<string>(),
      typeLabels: new Set<string>(),
      matchedRegions: new Set<KoreaRegion>([region]),
      addressesByRegion: { [region]: address },
    };
    if (sourceAddress) candidate.address = sourceAddress;
    candidate.addressesByRegion[region] = sourceAddress ?? address;
    candidate.categories.add(category);
    candidate.imageTitles.add(imageTitle);
    if (typeLabel) candidate.typeLabels.add(typeLabel);
    candidate.matchedRegions.add(region);
    candidates.set(qid, candidate);
  }
  return [...candidates.values()].sort((a, b) => Number(a.qid.slice(1)) - Number(b.qid.slice(1)));
}

export function consolidateCandidates(candidates: readonly Candidate[]): Candidate[] {
  const consolidated = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const existing = consolidated.get(candidate.qid);
    if (!existing) {
      consolidated.set(candidate.qid, {
        ...candidate,
        categories: new Set(candidate.categories),
        imageTitles: new Set(candidate.imageTitles),
        typeLabels: new Set(candidate.typeLabels),
        matchedRegions: new Set(candidate.matchedRegions),
        addressesByRegion: { ...candidate.addressesByRegion },
      });
      continue;
    }
    for (const category of candidate.categories) existing.categories.add(category);
    for (const title of candidate.imageTitles) existing.imageTitles.add(title);
    for (const label of candidate.typeLabels) existing.typeLabels.add(label);
    for (const region of candidate.matchedRegions) existing.matchedRegions.add(region);
    Object.assign(existing.addressesByRegion, candidate.addressesByRegion);
  }
  return [...consolidated.values()].sort((a, b) => Number(a.qid.slice(1)) - Number(b.qid.slice(1)));
}

export function buildRegionQuery(regionId: string): string {
  return `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?coord ?address ?adminLabel ?image ?category ?typeLabel WHERE {
  ?item wdt:P131* wd:${regionId};
        wdt:P625 ?coord;
        wdt:P31 ?type;
        wdt:P18 ?image.
  OPTIONAL { ?item wdt:P6375 ?address. }
  OPTIONAL {
    ?item wdt:P131 ?admin.
    ?admin wdt:P131* wd:${regionId}.
  }
  VALUES (?categoryRoot ?category) { ${CATEGORY_ROOTS} }
  ?type wdt:P279* ?categoryRoot.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ko,en". }
}
LIMIT 1000`.trim();
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) throw new Error(`HTTP ${response.status}`);
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((accept) => setTimeout(accept, 1_000 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
}

async function discoverRegion(regionId: string, region: KoreaRegion): Promise<Candidate[]> {
  const body = new URLSearchParams({ query: buildRegionQuery(regionId) });
  const response = await fetchWithRetry(WIKIDATA_SPARQL, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });
  const payload = await response.json() as { results?: { bindings?: WikidataBinding[] } };
  if (!Array.isArray(payload.results?.bindings)) throw new Error(`Wikidata returned no bindings for ${region}`);
  return collectCandidates(payload.results.bindings, region);
}

function radians(value: number): number {
  return value * Math.PI / 180;
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const lat = radians(b.latitude - a.latitude);
  const lon = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const reviewDecisionFileSchema = z.object({
  schema_version: z.literal(1),
  decisions: z.array(z.discriminatedUnion("decision", [
    z.object({
      qid: z.string().regex(/^Q\d+$/),
      decision: z.literal("accept"),
      category: z.enum(LOCATION_CATEGORY_VALUES),
      region: z.enum(KOREA_REGION_VALUES).optional(),
      note: z.string().trim().min(1),
      reviewed_by: z.string().trim().min(1),
      reviewed_at: z.iso.datetime({ offset: true }),
    }).strict(),
    z.object({
      qid: z.string().regex(/^Q\d+$/),
      decision: z.literal("reject"),
      note: z.string().trim().min(1),
      reviewed_by: z.string().trim().min(1),
      reviewed_at: z.iso.datetime({ offset: true }),
    }).strict(),
  ])).default([]),
}).strict();

export function parseReviewDecisions(value: unknown): Map<string, ReviewDecision> {
  const parsed = reviewDecisionFileSchema.parse(value);
  const decisions = new Map<string, ReviewDecision>();
  for (const item of parsed.decisions) {
    if (decisions.has(item.qid)) throw new Error(`Duplicate review decision: ${item.qid}`);
    decisions.set(item.qid, {
      qid: item.qid,
      decision: item.decision,
      category: item.decision === "accept" ? item.category : null,
      region: item.decision === "accept" ? item.region ?? null : null,
      note: item.note,
      reviewedBy: item.reviewed_by,
      reviewedAt: item.reviewed_at,
    });
  }
  return decisions;
}

export function getRepresentativeCases(candidate: Candidate): string[] {
  const searchable = [candidate.name, ...candidate.typeLabels].join(" ");
  return MANUAL_REVIEW_CASES
    .filter(({ pattern }) => pattern.test(searchable))
    .map(({ kind }) => kind);
}

export function getCandidateReviewItem(candidate: Candidate): CandidateReviewItem | null {
  const reasons: CandidateReviewReason[] = [];
  const representativeCases = getRepresentativeCases(candidate);
  if (candidate.categories.size > 1) reasons.push("MULTIPLE_CATEGORIES");
  if (candidate.matchedRegions.size > 1) reasons.push("MULTIPLE_REGIONS");
  if (representativeCases.length > 0) reasons.push("REPRESENTATIVE_CASE");
  if (reasons.length === 0) return null;
  return {
    qid: candidate.qid,
    name: candidate.name,
    regions: [...candidate.matchedRegions].sort(
      (a, b) => KOREA_REGION_VALUES.indexOf(a) - KOREA_REGION_VALUES.indexOf(b),
    ),
    addressesByRegion: Object.fromEntries(
      KOREA_REGION_VALUES
        .filter((region) => candidate.addressesByRegion[region])
        .map((region) => [region, candidate.addressesByRegion[region]]),
    ),
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    categories: [...candidate.categories].sort(
      (a, b) => LOCATION_CATEGORY_VALUES.indexOf(a) - LOCATION_CATEGORY_VALUES.indexOf(b),
    ),
    typeLabels: [...candidate.typeLabels].sort(),
    representativeCases,
    reasons,
    sourceUrl: `https://www.wikidata.org/wiki/${candidate.qid}`,
  };
}

export function filterCandidatesForDeficientCells(
  candidates: readonly Candidate[],
  coverage: CoverageReport,
): Candidate[] {
  const deficientCells = new Set(
    coverage.cells
      .filter((cell) => !cell.meetsTarget)
      .map((cell) => coverageCellKey(cell.region, cell.category)),
  );
  return candidates.filter((candidate) =>
    [...candidate.matchedRegions].some((region) =>
      [...candidate.categories].some((category) => deficientCells.has(coverageCellKey(region, category)))),
  );
}

export function prioritizeReviewQueue(
  items: readonly CandidateReviewItem[],
  coverage: CoverageReport,
): PrioritizedCandidateReviewItem[] {
  const cells = new Map(coverage.cells.map((cell) => [coverageCellKey(cell.region, cell.category), cell]));
  return items.map((item) => ({
    ...item,
    coverageCells: item.regions.flatMap((region) => item.categories.flatMap((category) => {
      const cell = cells.get(coverageCellKey(region, category));
      if (!cell || cell.meetsTarget) return [];
      return [{
        region: cell.region,
        category: cell.category,
        count: cell.count,
        target: cell.target,
        deficit: cell.deficit,
      }];
    })),
  })).filter((item) => item.coverageCells.length > 0).sort((a, b) => {
    const aMinimum = Math.min(...a.coverageCells.map((cell) => cell.count));
    const bMinimum = Math.min(...b.coverageCells.map((cell) => cell.count));
    return aMinimum - bMinimum
      || LOCATION_CATEGORY_VALUES.indexOf(a.coverageCells[0].category)
        - LOCATION_CATEGORY_VALUES.indexOf(b.coverageCells[0].category)
      || KOREA_REGION_VALUES.indexOf(a.coverageCells[0].region) - KOREA_REGION_VALUES.indexOf(b.coverageCells[0].region)
      || Number(a.qid.slice(1)) - Number(b.qid.slice(1));
  });
}

export function resolveCandidateCategory(
  candidate: Candidate,
  decisions: ReadonlyMap<string, ReviewDecision>,
): {
  category: LocationCategory | null;
  region: KoreaRegion | null;
  address: string | null;
  reviewItem: CandidateReviewItem | null;
  rejectedByReview: boolean;
} {
  const reviewItem = getCandidateReviewItem(candidate);
  const decision = decisions.get(candidate.qid);
  if (decision?.decision === "reject") {
    return { category: null, region: null, address: null, reviewItem: null, rejectedByReview: true };
  }
  if (decision?.decision === "accept") {
    if (!decision.category || !candidate.categories.has(decision.category)) {
      throw new Error(`Review decision category is not supported by Wikidata types: ${candidate.qid}`);
    }
    const region = decision.region ?? (candidate.matchedRegions.size === 1 ? [...candidate.matchedRegions][0] : null);
    if (!region || !candidate.matchedRegions.has(region)) {
      throw new Error(`Review decision must select a supported region: ${candidate.qid}`);
    }
    const address = candidate.addressesByRegion[region];
    if (!address) throw new Error(`Review decision has no address for selected region: ${candidate.qid}`);
    return { category: decision.category, region, address, reviewItem: null, rejectedByReview: false };
  }
  if (reviewItem) {
    return { category: null, region: null, address: null, reviewItem, rejectedByReview: false };
  }
  const region = [...candidate.matchedRegions][0] ?? null;
  return {
    category: [...candidate.categories][0] ?? null,
    region,
    address: region ? candidate.addressesByRegion[region] ?? null : null,
    reviewItem: null,
    rejectedByReview: false,
  };
}

type ExistingLocation = CoverageLocation & {
  name: string;
  latitude: number;
  longitude: number;
};

export function selectCoverageCandidates(
  candidates: readonly ReadyCandidate[],
  baseLocations: readonly ExistingLocation[],
  usedImageTitles: ReadonlySet<string>,
  maximumNewLocations: number,
  targetMinimumPerCell: number,
): {
  accepted: SelectedCandidate[];
  duplicateQids: string[];
  noUniqueImageQids: string[];
} {
  const pending = [...candidates].sort((a, b) => Number(a.qid.slice(1)) - Number(b.qid.slice(1)));
  const accepted: SelectedCandidate[] = [];
  const duplicateQids: string[] = [];
  const noUniqueImageQids: string[] = [];
  const usedTitles = new Set(usedImageTitles);
  const coverageLocations: CoverageLocation[] = [...baseLocations];

  while (accepted.length < maximumNewLocations) {
    const coverage = createCoverageReport(coverageLocations, targetMinimumPerCell);
    const counts = new Map(coverage.cells.map((cell) => [coverageCellKey(cell.region, cell.category), cell.count]));
    const categoryTotals = coverage.categoryTotals;
    const eligible = pending
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => (counts.get(coverageCellKey(candidate.region, candidate.category)) ?? 0) < targetMinimumPerCell)
      .sort((a, b) => {
        const aCount = counts.get(coverageCellKey(a.candidate.region, a.candidate.category)) ?? 0;
        const bCount = counts.get(coverageCellKey(b.candidate.region, b.candidate.category)) ?? 0;
        return aCount - bCount
          || categoryTotals[a.candidate.category] - categoryTotals[b.candidate.category]
          || KOREA_REGION_VALUES.indexOf(a.candidate.region) - KOREA_REGION_VALUES.indexOf(b.candidate.region)
          || LOCATION_CATEGORY_VALUES.indexOf(a.candidate.category) - LOCATION_CATEGORY_VALUES.indexOf(b.candidate.category)
          || Number(a.candidate.qid.slice(1)) - Number(b.candidate.qid.slice(1));
      });
    const next = eligible[0];
    if (!next) break;
    const [candidate] = pending.splice(next.index, 1);
    const fileTitle = candidate.licensedImageTitles.find((title) => !usedTitles.has(title));
    if (!fileTitle) {
      noUniqueImageQids.push(candidate.qid);
      continue;
    }
    const nearExisting = [...baseLocations, ...accepted].some((location) =>
      distanceMeters(candidate, location) < 120
      || location.name.normalize("NFKC").toLocaleLowerCase() === candidate.name.normalize("NFKC").toLocaleLowerCase());
    if (nearExisting) {
      duplicateQids.push(candidate.qid);
      continue;
    }
    usedTitles.add(fileTitle);
    accepted.push({ ...candidate, fileTitle });
    coverageLocations.push(candidate);
  }

  return { accepted, duplicateQids, noUniqueImageQids };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

type CliOptions = {
  outputPath: string;
  basePath: string | null;
  maximumNewLocations: number;
  verifiedAt: string;
  targetMinimumPerCell: number;
  reviewDecisionsPath: string | null;
};

export function parseDiscoveryArgs(args: string[]): CliOptions {
  const outputPath = args[0];
  if (!outputPath) {
    throw new Error("Usage: pnpm data:discover-wikidata <output.json> [--base <manifest.json>] [--max N] [--target N] [--review-decisions PATH] [--verified-at ISO]");
  }
  let basePath: string | null = null;
  let maximumNewLocations = 400;
  let verifiedAt = new Date().toISOString();
  let targetMinimumPerCell = MINIMUM_LOCATIONS_PER_CELL;
  let reviewDecisionsPath: string | null = null;
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--base") basePath = args[++index] ?? null;
    else if (flag === "--max") maximumNewLocations = Number(args[++index]);
    else if (flag === "--target") targetMinimumPerCell = Number(args[++index]);
    else if (flag === "--review-decisions") reviewDecisionsPath = args[++index] ?? null;
    else if (flag === "--verified-at") verifiedAt = args[++index] ?? "";
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isInteger(maximumNewLocations) || maximumNewLocations < 1 || maximumNewLocations > 2_000) {
    throw new Error("--max must be an integer between 1 and 2000");
  }
  if (!Number.isInteger(targetMinimumPerCell) || targetMinimumPerCell < 1 || targetMinimumPerCell > 20) {
    throw new Error("--target must be an integer between 1 and 20");
  }
  if (!Number.isFinite(Date.parse(verifiedAt))) throw new Error("--verified-at must be an ISO timestamp");
  return {
    outputPath: resolve(outputPath),
    basePath: basePath ? resolve(basePath) : null,
    maximumNewLocations,
    verifiedAt,
    targetMinimumPerCell,
    reviewDecisionsPath: reviewDecisionsPath ? resolve(reviewDecisionsPath) : null,
  };
}

async function main(): Promise<void> {
  const options = parseDiscoveryArgs(process.argv.slice(2));
  const base = options.basePath
    ? parseCollectionManifest(JSON.parse(await readFile(options.basePath, "utf8")) as unknown)
    : null;
  const reviewDecisions = options.reviewDecisionsPath
    ? parseReviewDecisions(JSON.parse(await readFile(options.reviewDecisionsPath, "utf8")) as unknown)
    : new Map<string, ReviewDecision>();
  const baseLocations = base?.locations ?? [];
  const coverageBefore = createCoverageReport(baseLocations, options.targetMinimumPerCell);
  console.log(
    `Coverage before discovery: under-target=${coverageBefore.summary.underTargetCells}/${coverageBefore.summary.totalCells}, deficit=${coverageBefore.summary.totalDeficit}`,
  );
  const discovered: Candidate[] = [];
  for (const { id, region } of WIKIDATA_REGIONS) {
    const candidates = await discoverRegion(id, region);
    discovered.push(...candidates);
    console.log(`Wikidata ${region}: ${candidates.length} classified candidates`);
  }

  const consolidated = consolidateCandidates(discovered);
  const coverageCandidates = filterCandidatesForDeficientCells(consolidated, coverageBefore);
  const allTitles = [...new Set(coverageCandidates.flatMap((candidate) => [...candidate.imageTitles]))].sort();
  const metadata = await fetchCommonsMetadataSettled(allTitles);
  const usedTitles = new Set(baseLocations.flatMap((location) => location.images.map((image) => image.file_title)));
  const readyCandidates: ReadyCandidate[] = [];
  const reviewQueue: CandidateReviewItem[] = [];
  let candidatesWithoutLicensedImage = 0;
  let rejectedByReview = 0;
  for (const candidate of coverageCandidates) {
    const licensedImageTitles = [...candidate.imageTitles]
      .filter((title) => metadata.accepted.has(title) && !usedTitles.has(title))
      .sort();
    if (licensedImageTitles.length === 0) {
      candidatesWithoutLicensedImage += 1;
      continue;
    }
    const resolution = resolveCandidateCategory(candidate, reviewDecisions);
    if (resolution.rejectedByReview) {
      rejectedByReview += 1;
      continue;
    }
    if (resolution.reviewItem) {
      reviewQueue.push(resolution.reviewItem);
      continue;
    }
    if (!resolution.category || !resolution.region || !resolution.address) continue;
    readyCandidates.push({
      ...candidate,
      region: resolution.region,
      address: resolution.address,
      category: resolution.category,
      licensedImageTitles,
    });
  }

  const selection = selectCoverageCandidates(
    readyCandidates,
    baseLocations,
    usedTitles,
    options.maximumNewLocations,
    options.targetMinimumPerCell,
  );
  const accepted = selection.accepted.map((candidate) => {
    const slug = `wikidata-${candidate.qid.toLowerCase()}`;
    return {
      id: deterministicUuid(`location:${candidate.qid}`),
      slug,
      name: candidate.name,
      description: candidate.description,
      category: candidate.category,
      region: candidate.region,
      address: candidate.address,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      source: "Wikidata (CC0)",
      source_url: `https://www.wikidata.org/wiki/${candidate.qid}`,
      images: [{
        id: deterministicUuid(`image:${candidate.qid}:${candidate.fileTitle}`),
        file_title: candidate.fileTitle,
        filename: `${slug}-01.jpg`,
        alt: `${candidate.name} 전경`,
      }],
    };
  });

  const output = parseCollectionManifest({
    schema_version: 1,
    verified_at: options.verifiedAt,
    public_base_url: base?.public_base_url ?? "https://beceleb.org/locations",
    attribution_url: base?.attribution_url ?? "https://github.com/WooSungHyun03/scenescan/blob/main/data/production/IMAGE_LICENSES.md",
    locations: [...baseLocations, ...accepted],
  });
  await writeJsonAtomic(options.outputPath, output);
  const coverageAfter = createCoverageReport(output.locations, options.targetMinimumPerCell);
  const reportPath = options.outputPath.endsWith(".json")
    ? `${options.outputPath.slice(0, -5)}.report.json`
    : `${options.outputPath}.report.json`;
  await writeJsonAtomic(reportPath, {
    schema_version: 1,
    discovered_region_matches: discovered.length,
    discovered_candidates: consolidated.length,
    candidates_in_under_target_cells: coverageCandidates.length,
    licensed_images_accepted: metadata.accepted.size,
    images_rejected: metadata.rejected.length,
    existing_locations: baseLocations.length,
    new_locations: accepted.length,
    total_locations: output.locations.length,
    target_minimum_per_region_category: options.targetMinimumPerCell,
    candidates_without_licensed_image: candidatesWithoutLicensedImage,
    candidates_rejected_by_manual_review: rejectedByReview,
    duplicate_candidates_rejected: selection.duplicateQids.length,
    candidates_without_unique_image: selection.noUniqueImageQids.length,
    coverage_before: coverageBefore,
    coverage_after: coverageAfter,
    review_queue: prioritizeReviewQueue(reviewQueue, coverageBefore),
  });
  console.log(
    `Accepted ${accepted.length} new locations; total=${output.locations.length}, under-target=${coverageAfter.summary.underTargetCells}, review=${reviewQueue.length}.`,
  );
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
