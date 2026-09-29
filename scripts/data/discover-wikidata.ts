import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { LocationCategory, Region } from "../../src/types/domain.ts";
import {
  fetchCommonsMetadataSettled,
  parseCollectionManifest,
} from "./collect-commons.ts";

const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const USER_AGENT = "SceneScan/0.1 (open-source location dataset; https://github.com/WooSungHyun03/scenescan)";
const DATASET_NAMESPACE = "ca26f0ab-6294-4fbf-8c7f-d758c2cb66b4";

export const WIKIDATA_REGIONS: ReadonlyArray<{ id: string; region: Region }> = [
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

const CATEGORY_PRIORITY: ReadonlyArray<LocationCategory> = ["industrial", "interior", "urban", "nature"];
const UNSUITABLE_LOCATION_NAME = /(고등학교|중학교|초등학교|병원|사관학교|소방학교|우체국|연구원)/;
const REGION_ADDRESS_MARKERS: Record<Region, readonly string[]> = {
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
  (wd:Q628179 "nature")
  (wd:Q166142 "industrial") (wd:Q83405 "industrial")
  (wd:Q1362225 "industrial") (wd:Q159719 "industrial")
  (wd:Q1248784 "industrial") (wd:Q44782 "industrial")
  (wd:Q33506 "interior") (wd:Q7075 "interior") (wd:Q24354 "interior")
  (wd:Q11315 "interior") (wd:Q483110 "interior")
  (wd:Q2281788 "interior") (wd:Q330284 "interior") (wd:Q27686 "interior")
  (wd:Q11707 "interior")
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
type Candidate = {
  qid: string;
  name: string;
  description: string;
  region: Region;
  address: string;
  latitude: number;
  longitude: number;
  categories: Set<LocationCategory>;
  imageTitles: Set<string>;
};

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
  return { latitude, longitude };
}

function qidFromEntity(value: string): string {
  const match = /\/entity\/(Q\d+)$/.exec(value);
  if (!match) throw new Error(`Invalid Wikidata entity URL: ${value}`);
  return match[1];
}

export function collectCandidates(bindings: WikidataBinding[], region: Region): Candidate[] {
  const candidates = new Map<string, Candidate>();
  for (const binding of bindings) {
    const item = bindingText(binding, "item");
    const name = bindingText(binding, "itemLabel");
    const address = bindingText(binding, "address");
    const point = bindingText(binding, "coord");
    const image = bindingText(binding, "image");
    const category = bindingText(binding, "category") as LocationCategory | null;
    if (!item || !name || !address || !point || !image || !category || !CATEGORY_PRIORITY.includes(category)) continue;
    if (UNSUITABLE_LOCATION_NAME.test(name)) continue;
    if (address.includes("[[") || !REGION_ADDRESS_MARKERS[region].some((marker) => address.toLocaleLowerCase().includes(marker.toLocaleLowerCase()))) continue;
    let qid: string;
    let coordinates: { latitude: number; longitude: number };
    let imageTitle: string;
    try {
      qid = qidFromEntity(item);
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
    };
    candidate.categories.add(category);
    candidate.imageTitles.add(imageTitle);
    candidates.set(qid, candidate);
  }
  return [...candidates.values()].sort((a, b) => Number(a.qid.slice(1)) - Number(b.qid.slice(1)));
}

export function buildRegionQuery(regionId: string): string {
  return `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?coord ?address ?image ?category WHERE {
  ?item wdt:P131* wd:${regionId};
        wdt:P625 ?coord;
        wdt:P6375 ?address;
        wdt:P31 ?type;
        wdt:P18 ?image.
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

async function discoverRegion(regionId: string, region: Region): Promise<Candidate[]> {
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

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

type CliOptions = { outputPath: string; basePath: string | null; maximumNewLocations: number; verifiedAt: string };

export function parseDiscoveryArgs(args: string[]): CliOptions {
  const outputPath = args[0];
  if (!outputPath) throw new Error("Usage: pnpm data:discover-wikidata <output.json> [--base <manifest.json>] [--max N] [--verified-at ISO]");
  let basePath: string | null = null;
  let maximumNewLocations = 400;
  let verifiedAt = new Date().toISOString();
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--base") basePath = args[++index] ?? null;
    else if (flag === "--max") maximumNewLocations = Number(args[++index]);
    else if (flag === "--verified-at") verifiedAt = args[++index] ?? "";
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isInteger(maximumNewLocations) || maximumNewLocations < 1 || maximumNewLocations > 2_000) {
    throw new Error("--max must be an integer between 1 and 2000");
  }
  if (!Number.isFinite(Date.parse(verifiedAt))) throw new Error("--verified-at must be an ISO timestamp");
  return { outputPath: resolve(outputPath), basePath: basePath ? resolve(basePath) : null, maximumNewLocations, verifiedAt };
}

async function main(): Promise<void> {
  const options = parseDiscoveryArgs(process.argv.slice(2));
  const base = options.basePath
    ? parseCollectionManifest(JSON.parse(await readFile(options.basePath, "utf8")) as unknown)
    : null;
  const discovered: Candidate[] = [];
  for (const { id, region } of WIKIDATA_REGIONS) {
    const candidates = await discoverRegion(id, region);
    discovered.push(...candidates);
    console.log(`Wikidata ${region}: ${candidates.length} classified candidates`);
  }

  const allTitles = [...new Set(discovered.flatMap((candidate) => [...candidate.imageTitles]))].sort();
  const metadata = await fetchCommonsMetadataSettled(allTitles);
  const baseLocations = base?.locations ?? [];
  const usedTitles = new Set(baseLocations.flatMap((location) => location.images.map((image) => image.file_title)));
  const accepted = [];
  for (const candidate of discovered) {
    if (accepted.length >= options.maximumNewLocations) break;
    const nearExisting = [...baseLocations, ...accepted].some((location) =>
      distanceMeters(candidate, location) < 120
      || location.name.normalize("NFKC").toLocaleLowerCase() === candidate.name.normalize("NFKC").toLocaleLowerCase());
    if (nearExisting) continue;
    const fileTitle = [...candidate.imageTitles].sort().find((title) => metadata.accepted.has(title) && !usedTitles.has(title));
    if (!fileTitle) continue;
    usedTitles.add(fileTitle);
    const category = CATEGORY_PRIORITY.find((value) => candidate.categories.has(value)) ?? "urban";
    const slug = `wikidata-${candidate.qid.toLowerCase()}`;
    accepted.push({
      id: deterministicUuid(`location:${candidate.qid}`),
      slug,
      name: candidate.name,
      description: candidate.description,
      category,
      region: candidate.region,
      address: candidate.address,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      source: "Wikidata (CC0)",
      source_url: `https://www.wikidata.org/wiki/${candidate.qid}`,
      images: [{
        id: deterministicUuid(`image:${candidate.qid}:${fileTitle}`),
        file_title: fileTitle,
        filename: `${slug}-01.jpg`,
        alt: `${candidate.name} 전경`,
      }],
    });
  }

  const output = parseCollectionManifest({
    schema_version: 1,
    verified_at: options.verifiedAt,
    public_base_url: base?.public_base_url ?? "https://beceleb.org/locations",
    attribution_url: base?.attribution_url ?? "https://github.com/WooSungHyun03/scenescan/blob/main/data/production/IMAGE_LICENSES.md",
    locations: [...baseLocations, ...accepted],
  });
  await writeJsonAtomic(options.outputPath, output);
  const reportPath = options.outputPath.endsWith(".json")
    ? `${options.outputPath.slice(0, -5)}.report.json`
    : `${options.outputPath}.report.json`;
  await writeJsonAtomic(reportPath, {
    schema_version: 1,
    discovered_candidates: discovered.length,
    licensed_images_accepted: metadata.accepted.size,
    images_rejected: metadata.rejected.length,
    existing_locations: baseLocations.length,
    new_locations: accepted.length,
    total_locations: output.locations.length,
  });
  console.log(`Accepted ${accepted.length} new locations; total manifest size is ${output.locations.length}.`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
