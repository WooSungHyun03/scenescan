import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { parseCollectionManifest, fetchCommonsMetadataSettled } from "./collect-commons.ts";
import { deterministicUuid, parseReviewDecisions, selectCoverageCandidates, type ReadyCandidate } from "./discover-wikidata.ts";
import { LOCATION_CATEGORY_VALUES } from "../../src/types/location-options.ts";
import { KOREA_REGION_VALUES } from "./contracts.ts";

// Promote explicit review decisions without repeating seventeen expensive
// SPARQL queries. Coordinates and source images are rechecked with the official
// entity API; the Commons collector remains the final license/download gate.
const reviewSchema = z.object({ review_queue: z.array(z.object({
  qid: z.string().regex(/^Q\d+$/), name: z.string().min(1),
  regions: z.array(z.enum(KOREA_REGION_VALUES)).min(1),
  categories: z.array(z.enum(LOCATION_CATEGORY_VALUES)).min(1),
  addressesByRegion: z.record(z.string(), z.string()),
  latitude: z.number().finite(), longitude: z.number().finite(),
  typeLabels: z.array(z.string()),
}).passthrough()) }).passthrough();
const entitySchema = z.object({ entities: z.record(z.string(), z.object({
  claims: z.object({
    P18: z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.string() }).optional() }) })).optional(),
    P625: z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.object({
      latitude: z.number(), longitude: z.number(), globe: z.string(),
    }) }).optional() }) })).optional(),
  }).passthrough(),
}).passthrough()) });

const [reportPath, decisionsPath, basePath, outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error("Usage: node --experimental-strip-types scripts/data/expand-reviewed.ts <discovery-report> <decisions> <base-manifest> <output-manifest>");
const report = reviewSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));
const decisions = parseReviewDecisions(JSON.parse(await readFile(decisionsPath, "utf8")));
const base = parseCollectionManifest(JSON.parse(await readFile(basePath, "utf8")));
const selected = report.review_queue.filter((item) => decisions.get(item.qid)?.decision === "accept");
if (selected.length !== [...decisions.values()].filter((decision) => decision.decision === "accept").length) throw new Error("Accepted review ID missing from discovery report");
const entities: z.infer<typeof entitySchema>["entities"] = {};
for (let offset = 0; offset < selected.length; offset += 50) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({ action: "wbgetentities", format: "json", props: "claims",
    ids: selected.slice(offset, offset + 50).map((item) => item.qid).join("|") }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: {
    "User-Agent": "SceneScan/0.1 (https://github.com/WooSungHyun03/scenescan)",
  } });
  if (!response.ok) throw new Error(`Wikidata entity verification failed: HTTP ${response.status}`);
  Object.assign(entities, entitySchema.parse(await response.json()).entities);
}
const allTitles = selected.flatMap((item) => entities[item.qid]?.claims.P18?.flatMap((claim) =>
  claim.mainsnak.datavalue ? [`File:${claim.mainsnak.datavalue.value.replaceAll("_", " ")}`] : []) ?? []);
const metadata = await fetchCommonsMetadataSettled([...new Set(allTitles)].sort());
const candidates: ReadyCandidate[] = selected.map((item) => {
  const decision = decisions.get(item.qid)!;
  const region = decision.region ?? (item.regions.length === 1 ? item.regions[0] : null);
  if (!region || !item.regions.includes(region) || !decision.category || !item.categories.includes(decision.category)) throw new Error(`Unsupported review category/region: ${item.qid}`);
  const coordinate = entities[item.qid]?.claims.P625?.some((claim) => {
    const point = claim.mainsnak.datavalue?.value;
    return point && point.globe.endsWith("/Q2") && Math.abs(point.latitude - item.latitude) < 0.005 && Math.abs(point.longitude - item.longitude) < 0.005;
  });
  if (!coordinate) throw new Error(`Wikidata coordinates changed or unavailable: ${item.qid}`);
  const licensedImageTitles = (entities[item.qid]?.claims.P18 ?? []).flatMap((claim) => {
    const value = claim.mainsnak.datavalue?.value;
    if (!value) return [];
    const title = `File:${value.replaceAll("_", " ")}`;
    const image = metadata.accepted.get(title);
    return image && Math.max(image.width, image.height) >= 800 && Math.min(image.width, image.height) >= 256 ? [title] : [];
  }).sort();
  return { qid: item.qid, name: item.name, description: `${region}의 ${item.name}. 위치와 원본 사진 출처를 확인하고 방문 전 촬영 조건을 문의해 주세요.`,
    region, address: item.addressesByRegion[region], latitude: item.latitude, longitude: item.longitude,
    categories: new Set(item.categories), category: decision.category, imageTitles: new Set(licensedImageTitles), licensedImageTitles,
    typeLabels: new Set(item.typeLabels), matchedRegions: new Set(item.regions), addressesByRegion: item.addressesByRegion };
});
const usedTitles = new Set(base.locations.flatMap((location) => location.images.map((image) => image.file_title)));
const selection = selectCoverageCandidates(candidates, base.locations, usedTitles, 150, 5);
const priorLicenses = JSON.parse(await readFile("data/production/image-licenses.json", "utf8")) as { items: Array<{ image_id: string; source_sha1: string }> };
const baseImageIds = new Set(base.locations.flatMap((location) => location.images.map((image) => image.id)));
const usedHashes = new Set(priorLicenses.items.filter((image) => baseImageIds.has(image.image_id)).map((image) => image.source_sha1));
const added = selection.accepted.flatMap((candidate) => {
  const slug = `wikidata-${candidate.qid.toLowerCase()}`;
  const images = candidate.licensedImageTitles.filter((title) => {
    const image = metadata.accepted.get(title)!;
    if (usedTitles.has(title) || usedHashes.has(image.sourceSha1)) return false;
    usedTitles.add(title); usedHashes.add(image.sourceSha1); return true;
  }).slice(0, 3).map((title, index) => ({ id: deterministicUuid(`image:${candidate.qid}:${title}`),
    file_title: title, filename: `${slug}-${String(index + 1).padStart(2, "0")}.jpg`, alt: `${candidate.name} 사진 ${index + 1}` }));
  if (!images.length) return [];
  return [{ id: deterministicUuid(`location:${candidate.qid}`), slug, name: candidate.name,
    description: candidate.description, category: candidate.category, region: candidate.region, address: candidate.address,
    latitude: candidate.latitude, longitude: candidate.longitude, source: "Wikidata (CC0)",
    source_url: `https://www.wikidata.org/wiki/${candidate.qid}`, images }];
});
const manifest = parseCollectionManifest({ ...base, verified_at: new Date().toISOString(), locations: [...base.locations, ...added] });
await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Reviewed expansion: accepted=${added.length}, images=${added.reduce((sum, location) => sum + location.images.length, 0)}, duplicates=${selection.duplicateQids.length}, license_rejections=${metadata.rejected.length}`);
