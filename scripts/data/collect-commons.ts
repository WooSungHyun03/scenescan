import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import type { NormalizedLocationOutput } from "./contracts.ts";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import { parseManifest as parseEmbeddingManifest } from "../embeddings/contracts.ts";
import { LOCATION_CATEGORY_VALUES, REGION_VALUES } from "../../src/types/location-options.ts";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "SceneScan/0.1 (open-source location dataset; https://github.com/WooSungHyun03/scenescan)";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_LICENSES = /^(?:CC0|Public domain|CC BY(?:-SA)? (?:2\.0|3\.0|4\.0))$/;

const httpUrl = z.string().url().refine((value) => value.startsWith("https://"), "URL must use HTTPS");
const imageSchema = z.object({
  id: z.string().uuid(),
  file_title: z.string().startsWith("File:"),
  filename: z.string().regex(/^[a-z0-9-]+\.jpg$/),
  alt: z.string().trim().min(1),
}).strict();
const locationSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  category: z.enum(LOCATION_CATEGORY_VALUES),
  region: z.enum(REGION_VALUES),
  address: z.string().trim().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  source: z.string().trim().min(1),
  source_url: httpUrl,
  images: z.array(imageSchema).min(1),
}).strict();
const collectionManifestSchema = z.object({
  schema_version: z.literal(1),
  verified_at: z.iso.datetime({ offset: true }),
  public_base_url: httpUrl,
  attribution_url: httpUrl,
  locations: z.array(locationSchema).min(1),
}).strict();

type CollectionManifest = z.infer<typeof collectionManifestSchema>;
export type CommonsMetadata = {
  title: string;
  pageUrl: string;
  originalUrl: string;
  thumbnailUrl: string;
  mime: string;
  width: number;
  height: number;
  sourceSha1: string;
  artist: string;
  credit: string;
  license: string;
  licenseUrl: string;
  restrictions: string;
};

type CommonsApiValue = { value?: unknown };
type CommonsApiImageInfo = {
  url?: unknown;
  descriptionurl?: unknown;
  thumburl?: unknown;
  mime?: unknown;
  width?: unknown;
  height?: unknown;
  sha1?: unknown;
  extmetadata?: Record<string, CommonsApiValue>;
};

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Commons metadata is missing ${field}`);
  return value.trim();
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`Commons metadata has invalid ${field}`);
  return value;
}

export function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCommonsImageInfo(title: string, info: CommonsApiImageInfo): CommonsMetadata {
  const metadata = info.extmetadata ?? {};
  const license = stripMarkup(text(metadata.LicenseShortName?.value, "LicenseShortName"));
  const restrictions = stripMarkup(typeof metadata.Restrictions?.value === "string" ? metadata.Restrictions.value : "");
  if (!ALLOWED_LICENSES.test(license)) throw new Error(`${title} uses an unapproved license: ${license}`);
  if (restrictions.length > 0) throw new Error(`${title} has additional restrictions: ${restrictions}`);

  const mime = text(info.mime, "mime");
  if (mime !== "image/jpeg") throw new Error(`${title} must resolve to image/jpeg, received ${mime}`);
  return {
    title,
    pageUrl: text(info.descriptionurl, "descriptionurl"),
    originalUrl: text(info.url, "url"),
    thumbnailUrl: text(info.thumburl, "thumburl"),
    mime,
    width: number(info.width, "width"),
    height: number(info.height, "height"),
    sourceSha1: text(info.sha1, "sha1"),
    artist: stripMarkup(text(metadata.Artist?.value, "Artist")),
    credit: stripMarkup(typeof metadata.Credit?.value === "string" ? metadata.Credit.value : "Wikimedia Commons"),
    license,
    licenseUrl: text(metadata.LicenseUrl?.value, "LicenseUrl"),
    restrictions,
  };
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function parseCollectionManifest(value: unknown): CollectionManifest {
  const manifest = collectionManifestSchema.parse(value);
  const images = manifest.locations.flatMap((location) => location.images);
  assertUnique(manifest.locations.map((location) => location.id), "location id");
  assertUnique(manifest.locations.map((location) => location.slug), "location slug");
  assertUnique(images.map((image) => image.id), "image id");
  assertUnique(images.map((image) => image.file_title), "Commons file title");
  assertUnique(images.map((image) => image.filename), "image filename");
  return manifest;
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    } catch (error) {
      lastError = error;
    }
    if (response?.ok) return response;
    if (response && response.status !== 429 && response.status < 500) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    if (response) lastError = new Error(`HTTP ${response.status} for ${url}`);
    if (attempt < attempts) await new Promise((accept) => setTimeout(accept, 250 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
}

async function fetchCommonsImageInfoBatch(titles: string[]): Promise<Map<string, CommonsApiImageInfo>> {
  const url = new URL(COMMONS_API);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    prop: "imageinfo",
    titles: titles.join("|"),
    iiprop: "url|mime|size|sha1|extmetadata",
    iiurlwidth: "1024",
  }).toString();
  const response = await fetchWithRetry(url.toString());
  const body = await response.json() as {
    query?: { pages?: Array<{ title?: unknown; missing?: unknown; imageinfo?: CommonsApiImageInfo[] }> };
  };
  const pages = body.query?.pages;
  if (!Array.isArray(pages)) throw new Error("Commons API response is missing query.pages");

  const result = new Map<string, CommonsApiImageInfo>();
  for (const page of pages) {
    const title = text(page.title, "page title");
    if (page.missing !== undefined || !page.imageinfo?.[0]) throw new Error(`Commons file is missing: ${title}`);
    result.set(title, page.imageinfo[0]);
  }
  for (const title of titles) if (!result.has(title)) throw new Error(`Commons API omitted requested file: ${title}`);
  return result;
}

export async function fetchCommonsMetadata(titles: string[]): Promise<Map<string, CommonsMetadata>> {
  const result = new Map<string, CommonsMetadata>();
  for (let index = 0; index < titles.length; index += 20) {
    const batch = await fetchCommonsImageInfoBatch(titles.slice(index, index + 20));
    for (const [title, info] of batch) result.set(title, parseCommonsImageInfo(title, info));
  }
  return result;
}

export async function fetchCommonsMetadataSettled(titles: string[]): Promise<{
  accepted: Map<string, CommonsMetadata>;
  rejected: Array<{ title: string; reason: string }>;
}> {
  const accepted = new Map<string, CommonsMetadata>();
  const rejected: Array<{ title: string; reason: string }> = [];
  for (let index = 0; index < titles.length; index += 20) {
    const requested = titles.slice(index, index + 20);
    let batch: Map<string, CommonsApiImageInfo>;
    try {
      batch = await fetchCommonsImageInfoBatch(requested);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      rejected.push(...requested.map((title) => ({ title, reason })));
      continue;
    }
    for (const [title, info] of batch) {
      try {
        accepted.set(title, parseCommonsImageInfo(title, info));
      } catch (error) {
        rejected.push({ title, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { accepted, rejected };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function downloadImage(url: string, outputPath: string): Promise<{ sha256: string; bytes: number }> {
  const response = await fetchWithRetry(url);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "image/jpeg") throw new Error(`${url} returned ${contentType ?? "no content type"}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error(`${url} has invalid size: ${buffer.length}`);
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9) {
    throw new Error(`${url} is not a complete JPEG file`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, buffer);
  await rename(temporaryPath, outputPath);
  return { sha256: createHash("sha256").update(buffer).digest("hex"), bytes: buffer.length };
}

export function buildLocationDataset(manifest: CollectionManifest): NormalizedLocationOutput {
  const verifiedAt = manifest.verified_at;
  return parseNormalizedLocationOutput({
    schemaVersion: 2,
    source: { name: "SceneScan curated public location dataset" },
    locations: manifest.locations.map((location) => ({
      id: location.id,
      name: location.name,
      description: location.description,
      category: location.category,
      region: location.region,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      permit: {
        type: "문의 필요",
        contactName: null,
        contactPhone: null,
        note: "촬영·시설 이용 조건은 운영기관에 사전 확인이 필요합니다.",
        provenance: { source: location.source, sourceUrl: location.source_url, referenceDate: null, lastVerifiedAt: verifiedAt },
      },
      parking: [],
      images: location.images.map((image) => ({
        imagePath: `public/locations/${image.filename}`,
        imageUrl: `${manifest.public_base_url}/${image.filename}`,
        alt: image.alt,
      })),
      sourceUrl: location.source_url,
      provenance: { source: location.source, sourceUrl: location.source_url, referenceDate: null, lastVerifiedAt: verifiedAt },
    })),
    reviewQueue: [],
  });
}

export function buildEmbeddingManifest(
  manifest: CollectionManifest,
  metadata: Map<string, CommonsMetadata>,
): ReturnType<typeof parseEmbeddingManifest> {
  return parseEmbeddingManifest({
    schema_version: 1,
    items: manifest.locations.flatMap((location) => location.images.map((image) => {
      const details = metadata.get(image.file_title);
      if (!details) throw new Error(`Missing verified metadata for ${image.file_title}`);
      return {
        image_id: image.id,
        location_id: location.id,
        image_path: `../../public/locations/${image.filename}`,
        image_url: `${manifest.public_base_url}/${image.filename}`,
        source: `Wikimedia Commons — ${details.artist} — ${details.license}`,
        source_url: details.pageUrl,
      };
    })),
  });
}

async function mapConcurrent<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await task(items[index]);
    }
  }));
}

export async function collectCommonsDataset(manifestPath: string, repositoryRoot: string): Promise<void> {
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  const manifest = parseCollectionManifest(raw);
  const imageEntries = manifest.locations.flatMap((location) => location.images.map((image) => ({ location, image })));
  const metadata = await fetchCommonsMetadata(imageEntries.map(({ image }) => image.file_title));
  const downloads = new Map<string, { sha256: string; bytes: number }>();

  await mapConcurrent(imageEntries, 4, async ({ image }) => {
    const details = metadata.get(image.file_title);
    if (!details) throw new Error(`Missing verified metadata for ${image.file_title}`);
    const result = await downloadImage(details.thumbnailUrl, resolve(repositoryRoot, "public/locations", image.filename));
    downloads.set(image.id, result);
    console.log(`Downloaded ${image.filename} (${result.bytes} bytes)`);
  });

  const locations = buildLocationDataset(manifest);
  const embeddings = buildEmbeddingManifest(manifest, metadata);
  const licenses = {
    schema_version: 1,
    verified_at: manifest.verified_at,
    items: imageEntries.map(({ location, image }) => {
      const details = metadata.get(image.file_title)!;
      const downloaded = downloads.get(image.id)!;
      return {
        image_id: image.id,
        location_id: location.id,
        location_name: location.name,
        filename: image.filename,
        commons_title: details.title,
        commons_page_url: details.pageUrl,
        original_url: details.originalUrl,
        downloaded_thumbnail_url: details.thumbnailUrl,
        author: details.artist,
        credit: details.credit,
        license: details.license,
        license_url: details.licenseUrl,
        source_sha1: details.sourceSha1,
        local_sha256: downloaded.sha256,
        source_width: details.width,
        source_height: details.height,
        local_bytes: downloaded.bytes,
        modification: "Wikimedia Commons 1024px thumbnail; no additional modification",
      };
    }),
  };
  const attributionMarkdown = [
    "# Production image licenses",
    "",
    `Generated from verified Wikimedia Commons metadata on ${manifest.verified_at}. These files are not covered by the repository MIT license. Retain the author, source, and license when redistributing an image. CC BY-SA adaptations must use the same or a compatible license.`,
    "",
    "| Local file / location | Author | License | Wikimedia Commons source |",
    "| --- | --- | --- | --- |",
    ...licenses.items.map((item) =>
      `| \`${item.filename}\` / ${markdownCell(item.location_name)} | ${markdownCell(item.author)} | [${markdownCell(item.license)}](<${item.license_url}>) | [source](<${item.commons_page_url}>) |`,
    ),
    "",
    "Exact source dimensions, original and thumbnail URLs, source SHA-1, local SHA-256, byte size, credit text, and modification notes are recorded in `image-licenses.json`.",
    "",
  ].join("\n");

  const outputDirectory = resolve(repositoryRoot, "data/production");
  await writeJsonAtomic(resolve(outputDirectory, "locations.json"), locations);
  await writeJsonAtomic(resolve(outputDirectory, "image-licenses.json"), licenses);
  await writeJsonAtomic(resolve(outputDirectory, "embeddings-manifest.json"), embeddings);
  await writeTextAtomic(resolve(outputDirectory, "IMAGE_LICENSES.md"), attributionMarkdown);
  console.log(`Collected ${manifest.locations.length} locations and ${imageEntries.length} licensed images.`);
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const manifestPath = resolve(process.argv[2] ?? resolve(repositoryRoot, "data/production/commons-manifest.json"));
  await collectCommonsDataset(manifestPath, repositoryRoot);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
