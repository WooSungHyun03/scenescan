import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseNormalizedLocationOutput, type NormalizedLocationOutput } from "./contracts.ts";
import {
  distanceMeters,
  MAX_NEARBY_PARKING_DISTANCE_METERS,
  STATIC_PARKING_SOURCE_URL,
} from "./static-parking.ts";

const API_URL = "https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api";
const PAGE_SIZE = 1_000;
const CLOSED_PATTERN = /폐쇄|폐업|운영\s*종료|사용\s*중지|철거/;

type JsonObject = Record<string, unknown>;

export type PortalParkingCandidate = {
  sourceRecordId: string;
  name: string;
  latitude: number;
  longitude: number;
  capacity: number | null;
  openingHours: string | null;
  priceInfo: string | null;
  institution: string | null;
  referenceDate: string;
};

export type PortalPage = {
  pageNo: number;
  numOfRows: number;
  totalCount: number;
  items: JsonObject[];
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function objectAt(value: unknown, path: string[]): JsonObject | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!isObject(current)) return null;
    current = current[segment];
  }
  return isObject(current) ? current : null;
}

export function parsePortalParkingPage(value: unknown): PortalPage {
  const response = objectAt(value, ["response"]);
  const header = response && objectAt(response, ["header"]);
  const body = response && objectAt(response, ["body"]);
  const resultCode = header ? text(header.resultCode) : null;
  if (!body || (resultCode !== null && resultCode !== "00")) {
    const message = header ? text(header.resultMsg) : null;
    throw new Error(`Public Data Portal parking API failed${message ? `: ${message}` : ""}`);
  }
  const rawItems = body.items;
  const items = Array.isArray(rawItems)
    ? rawItems
    : isObject(rawItems) && Array.isArray(rawItems.item)
      ? rawItems.item
      : [];
  if (!items.every(isObject)) throw new Error("Public Data Portal parking API returned malformed items");
  const pageNo = integer(body.pageNo);
  const numOfRows = integer(body.numOfRows);
  const totalCount = integer(body.totalCount);
  if (pageNo === null || numOfRows === null || totalCount === null) {
    throw new Error("Public Data Portal parking API returned malformed pagination");
  }
  return { pageNo, numOfRows, totalCount, items };
}

function openingHours(row: JsonObject): string | null {
  const days = text(row.operDay);
  const weekdayOpen = text(row.weekdayOperOpenHhmm);
  const weekdayClose = text(row.weekdayOperColseHhmm);
  const saturdayOpen = text(row.satOperOperOpenHhmm);
  const saturdayClose = text(row.satOperCloseHhmm);
  const holidayOpen = text(row.holidayOperOpenHhmm);
  const holidayClose = text(row.holidayCloseOpenHhmm);
  const periods = [
    weekdayOpen && weekdayClose ? `평일 ${weekdayOpen}–${weekdayClose}` : null,
    saturdayOpen && saturdayClose ? `토요일 ${saturdayOpen}–${saturdayClose}` : null,
    holidayOpen && holidayClose ? `공휴일 ${holidayOpen}–${holidayClose}` : null,
  ].filter((value): value is string => value !== null);
  return [days, ...periods].filter((value): value is string => value !== null).join(" · ") || null;
}

function priceInfo(row: JsonObject): string | null {
  const category = text(row.parkingchrgeInfo);
  if (!category) return null;
  if (category === "무료") return "무료";
  const parts = [category];
  const basicTime = integer(row.basicTime);
  const basicCharge = integer(row.basicCharge);
  const addTime = integer(row.addUnitTime);
  const addCharge = integer(row.addUnitCharge);
  const daily = integer(row.dayCmmtkt);
  if (basicTime !== null && basicCharge !== null) parts.push(`기본 ${basicTime}분 ${basicCharge.toLocaleString("ko-KR")}원`);
  if (addTime !== null && addCharge !== null) parts.push(`추가 ${addTime}분 ${addCharge.toLocaleString("ko-KR")}원`);
  if (daily !== null && daily > 0) parts.push(`1일 ${daily.toLocaleString("ko-KR")}원`);
  return parts.join(" · ");
}

export function normalizePortalParkingRow(row: JsonObject): PortalParkingCandidate {
  const sourceRecordId = text(row.prkplceNo);
  const name = text(row.prkplceNm);
  const latitude = number(row.latitude);
  const longitude = number(row.longitude);
  const referenceDate = text(row.referenceDate);
  const searchableStatus = [name, text(row.spcmnt)].filter(Boolean).join(" ");
  if (!sourceRecordId || !name || latitude === null || longitude === null || !referenceDate) {
    throw new Error("missing source ID, name, coordinate, or reference date");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
    || new Date(`${referenceDate}T00:00:00Z`).toISOString().slice(0, 10) !== referenceDate) {
    throw new Error("reference date is not a real YYYY-MM-DD date");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("coordinate is outside WGS84 bounds");
  }
  if (CLOSED_PATTERN.test(searchableStatus)) throw new Error("facility is marked closed or unavailable");
  return {
    sourceRecordId,
    name,
    latitude,
    longitude,
    capacity: integer(row.prkcmprt),
    openingHours: openingHours(row),
    priceInfo: priceInfo(row),
    institution: text(row.institutionNm),
    referenceDate,
  };
}

export function buildParkingCandidateReport(
  dataset: NormalizedLocationOutput,
  rows: JsonObject[],
  verifiedAt: string,
) {
  const accepted: Array<Record<string, unknown>> = [];
  const rejected: Array<{ sourceRecordId: string | null; reason: string }> = [];
  const seenSourceIds = new Set<string>();
  const seenPhysical = new Set<string>();
  for (const row of rows) {
    try {
      const parking = normalizePortalParkingRow(row);
      if (seenSourceIds.has(parking.sourceRecordId)) throw new Error("duplicate source record ID");
      seenSourceIds.add(parking.sourceRecordId);
      const physicalKey = `${parking.name.toLocaleLowerCase("ko-KR")}\u0000${parking.latitude.toFixed(6)}\u0000${parking.longitude.toFixed(6)}`;
      if (seenPhysical.has(physicalKey)) throw new Error("duplicate parking name and coordinates");
      seenPhysical.add(physicalKey);
      const nearest = dataset.locations
        .map((location) => ({ location, distance: distanceMeters(location, parking) }))
        .sort((left, right) => left.distance - right.distance)[0];
      if (!nearest || nearest.distance > MAX_NEARBY_PARKING_DISTANCE_METERS) continue;
      accepted.push({
        source_record_id: parking.sourceRecordId,
        nearest_location_id: nearest.location.id,
        nearest_location_name: nearest.location.name,
        distance_meters: Math.round(nearest.distance),
        relationship_requires_manual_review: true,
        name: parking.name,
        latitude: parking.latitude,
        longitude: parking.longitude,
        capacity: parking.capacity,
        opening_hours: parking.openingHours,
        price_info: parking.priceInfo,
        source: `공공데이터포털 전국주차장정보표준데이터${parking.institution ? ` · ${parking.institution}` : ""}`,
        source_url: STATIC_PARKING_SOURCE_URL,
        reference_date: parking.referenceDate,
        last_verified_at: verifiedAt,
      });
    } catch (error) {
      rejected.push({
        sourceRecordId: text(row.prkplceNo),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  accepted.sort((left, right) => Number(left.distance_meters) - Number(right.distance_meters));
  return {
    schema_version: 1,
    source: { name: "공공데이터포털 전국주차장정보표준데이터", url: STATIC_PARKING_SOURCE_URL },
    generated_at: verifiedAt,
    candidates: accepted,
    rejected,
  };
}

function serviceKey(value: string | undefined): string {
  if (!value?.trim()) throw new Error("PUBLIC_DATA_PORTAL_SERVICE_KEY is required (server-only; never use NEXT_PUBLIC_*)");
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

async function fetchAllParking(apiKey: string): Promise<{ pages: unknown[]; rows: JsonObject[] }> {
  const pages: unknown[] = [];
  const rows: JsonObject[] = [];
  let pageNo = 1;
  let totalCount = Number.POSITIVE_INFINITY;
  while (rows.length < totalCount) {
    const url = new URL(API_URL);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("numOfRows", String(PAGE_SIZE));
    url.searchParams.set("type", "json");
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Public Data Portal parking API returned HTTP ${response.status}`);
    const raw: unknown = await response.json();
    const page = parsePortalParkingPage(raw);
    pages.push(raw);
    rows.push(...page.items);
    totalCount = page.totalCount;
    if (page.items.length === 0) break;
    pageNo += 1;
  }
  return { pages, rows };
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const locationsPath = resolve(process.argv[2] ?? resolve(repositoryRoot, "data/production/locations.json"));
  const rawPath = resolve(process.argv[3] ?? resolve(repositoryRoot, "data-work/static-parking/raw.json"));
  const reportPath = resolve(process.argv[4] ?? resolve(repositoryRoot, "data-work/static-parking/candidates.json"));
  const dataset = parseNormalizedLocationOutput(JSON.parse(await readFile(locationsPath, "utf8")) as unknown);
  const collected = await fetchAllParking(serviceKey(process.env.PUBLIC_DATA_PORTAL_SERVICE_KEY));
  const verifiedAt = new Date().toISOString();
  await mkdir(dirname(rawPath), { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(rawPath, `${JSON.stringify({ fetched_at: verifiedAt, pages: collected.pages }, null, 2)}\n`, "utf8");
  const report = buildParkingCandidateReport(dataset, collected.rows, verifiedAt);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Static parking collection: rows=${collected.rows.length}, candidates=${report.candidates.length}, rejected=${report.rejected.length}`);
  console.log("Review every candidate's relationship before copying it to data/production/static-parking.json.");
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
