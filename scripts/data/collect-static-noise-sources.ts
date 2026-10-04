import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { parseNormalizedLocationOutput, type NormalizedLocationOutput } from "./contracts.ts";
import { distanceMeters } from "./static-parking.ts";
import {
  MAX_NOISE_SOURCE_DISTANCE_METERS,
  OPENSTREETMAP_ATTRIBUTION,
  OPENSTREETMAP_COPYRIGHT_URL,
  OPENSTREETMAP_LICENSE,
} from "./static-noise-sources.ts";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "SceneScan/0.1 (open-source location dataset; https://github.com/WooSungHyun03/scenescan)";

const overpassElementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number().int().positive(),
  lat: z.number().finite().optional(),
  lon: z.number().finite().optional(),
  center: z.object({ lat: z.number().finite(), lon: z.number().finite() }).optional(),
  tags: z.record(z.string(), z.string()).default({}),
}).refine((value) => (value.lat !== undefined && value.lon !== undefined) || value.center !== undefined, {
  message: "Overpass element requires coordinates or center",
});

const overpassResponseSchema = z.object({
  osm3s: z.object({ timestamp_osm_base: z.iso.datetime({ offset: true }) }),
  elements: z.array(overpassElementSchema),
}).passthrough();

type OverpassElement = z.infer<typeof overpassElementSchema>;

export type NoiseCandidate = {
  nearest_location_id: string;
  nearest_location_name: string;
  source_element_id: string;
  kind: "railway" | "major_road" | "airport" | "construction";
  description: string;
  feature_latitude: number;
  feature_longitude: number;
  distance_meters: number;
  evidence: string;
  source: string;
  source_url: string;
  license: string;
  license_url: string;
  reference_date: string;
  last_verified_at: string;
  review_required: true;
};

function elementPoint(element: OverpassElement): { latitude: number; longitude: number } {
  return {
    latitude: element.lat ?? element.center!.lat,
    longitude: element.lon ?? element.center!.lon,
  };
}

function classify(element: OverpassElement): NoiseCandidate["kind"] | null {
  const { tags } = element;
  if (tags.aeroway === "aerodrome" || tags.aeroway === "runway") return "airport";
  if (tags.landuse === "construction" || tags.highway === "construction" || tags.railway === "construction") return "construction";
  if ((tags.railway === "rail" || tags.railway === "light_rail") && tags.tunnel !== "yes" && tags.covered !== "yes") return "railway";
  if (["motorway", "trunk", "primary"].includes(tags.highway ?? "") && tags.tunnel !== "yes") return "major_road";
  return null;
}

function allowedDistance(kind: NoiseCandidate["kind"]): number {
  if (kind === "airport") return MAX_NOISE_SOURCE_DISTANCE_METERS;
  if (kind === "railway") return 2_000;
  if (kind === "construction") return 1_500;
  return 1_000;
}

function description(element: OverpassElement, kind: NoiseCandidate["kind"]): string {
  const name = element.tags["name:ko"] ?? element.tags.name ?? element.tags.ref ?? "이름 미기재 시설";
  const labels = { railway: "철도", major_road: "간선도로", airport: "공항 시설", construction: "공사 가능 시설" };
  return `${name} ${labels[kind]}가 공개 지도에서 확인됩니다. 실제 소음은 촬영 시간대 현장 답사로 확인해야 합니다.`;
}

function evidence(element: OverpassElement, kind: NoiseCandidate["kind"]): string {
  if (kind === "airport") return `OpenStreetMap ${element.type}/${element.id}의 aeroway=${element.tags.aeroway} 태그`;
  if (kind === "railway") return `OpenStreetMap ${element.type}/${element.id}의 railway=${element.tags.railway} 태그`;
  if (kind === "major_road") return `OpenStreetMap ${element.type}/${element.id}의 highway=${element.tags.highway} 태그`;
  const tag = element.tags.landuse ? `landuse=${element.tags.landuse}`
    : element.tags.highway ? `highway=${element.tags.highway}`
      : `railway=${element.tags.railway}`;
  return `OpenStreetMap ${element.type}/${element.id}의 ${tag} 태그`;
}

export function parseOverpassResponse(value: unknown) {
  return overpassResponseSchema.parse(value);
}

export function buildNoiseCandidateReport(
  location: NormalizedLocationOutput["locations"][number],
  response: ReturnType<typeof parseOverpassResponse>,
  verifiedAt: string,
) {
  const referenceDate = response.osm3s.timestamp_osm_base.slice(0, 10);
  const candidates: NoiseCandidate[] = [];
  const rejected: Array<{ sourceElementId: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const element of response.elements) {
    const sourceElementId = `${element.type}/${element.id}`;
    if (seen.has(sourceElementId)) continue;
    seen.add(sourceElementId);
    const kind = classify(element);
    if (!kind) {
      rejected.push({ sourceElementId, reason: "unsupported or shielded environmental feature" });
      continue;
    }
    const point = elementPoint(element);
    const distance = Math.round(distanceMeters(location, point));
    if (distance > allowedDistance(kind)) continue;
    candidates.push({
      nearest_location_id: location.id!,
      nearest_location_name: location.name,
      source_element_id: sourceElementId,
      kind,
      description: description(element, kind),
      feature_latitude: point.latitude,
      feature_longitude: point.longitude,
      distance_meters: distance,
      evidence: evidence(element, kind),
      source: OPENSTREETMAP_ATTRIBUTION,
      source_url: `https://www.openstreetmap.org/${sourceElementId}`,
      license: OPENSTREETMAP_LICENSE,
      license_url: OPENSTREETMAP_COPYRIGHT_URL,
      reference_date: referenceDate,
      last_verified_at: verifiedAt,
      review_required: true,
    });
  }
  candidates.sort((left, right) => left.distance_meters - right.distance_meters || left.source_url.localeCompare(right.source_url));
  return { candidates, rejected };
}

function overpassQuery(latitude: number, longitude: number): string {
  return `[out:json][timeout:60];(nwr(around:5000,${latitude},${longitude})["aeroway"~"^(aerodrome|runway)$"];way(around:2000,${latitude},${longitude})["railway"~"^(rail|light_rail|construction)$"];way(around:1000,${latitude},${longitude})["highway"~"^(motorway|trunk|primary|construction)$"];nwr(around:1500,${latitude},${longitude})["landuse"="construction"];);out center tags;`;
}

async function fetchOverpass(location: NormalizedLocationOutput["locations"][number]): Promise<unknown> {
  const response = await fetch(OVERPASS_API, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
    body: new URLSearchParams({ data: overpassQuery(location.latitude, location.longitude) }),
  });
  if (!response.ok) throw new Error(`Overpass request failed for ${location.name}: HTTP ${response.status}`);
  return response.json();
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const ids = process.argv.slice(2).filter((value) => !value.startsWith("--"));
  if (ids.length === 0 || ids.length > 25) {
    throw new Error("Usage: pnpm data:collect-noise <location-uuid> [... up to 25 reviewed location UUIDs]");
  }
  const dataset = parseNormalizedLocationOutput(JSON.parse(
    await readFile(resolve(repositoryRoot, "data/production/locations.json"), "utf8"),
  ));
  const byId = new Map(dataset.locations.map((location) => [location.id, location]));
  const verifiedAt = new Date().toISOString();
  const raw: Array<{ location_id: string; response: unknown }> = [];
  const candidates: NoiseCandidate[] = [];
  const rejected: Array<{ location_id: string; sourceElementId: string; reason: string }> = [];
  for (const id of ids) {
    const location = byId.get(id);
    if (!location) throw new Error(`Unknown location UUID: ${id}`);
    const responseValue = await fetchOverpass(location);
    raw.push({ location_id: id, response: responseValue });
    const report = buildNoiseCandidateReport(location, parseOverpassResponse(responseValue), verifiedAt);
    candidates.push(...report.candidates);
    rejected.push(...report.rejected.map((item) => ({ location_id: id, ...item })));
  }
  const outputDirectory = resolve(repositoryRoot, "data-work/static-noise-sources");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "raw.json"), `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDirectory, "candidates.json"), `${JSON.stringify({
    schema_version: 1,
    generated_at: verifiedAt,
    attribution: { source: OPENSTREETMAP_ATTRIBUTION, license: OPENSTREETMAP_LICENSE, license_url: OPENSTREETMAP_COPYRIGHT_URL },
    candidates,
    rejected,
  }, null, 2)}\n`, "utf8");
  console.log(`Wrote ${candidates.length} review candidates. No candidate was added to production automatically.`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
