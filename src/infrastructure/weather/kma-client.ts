import "server-only";

import { serverEnv } from "@/env/server";
import type { GeoPoint } from "@/types/domain";
import type {
  LocationWeather,
  WeatherGridPoint,
  WeatherPurpose,
  WeatherSkyCondition,
  WeatherSource,
} from "@/types/weather";
import { toKmaGrid } from "./kma-grid";
import {
  formatKmaDateTime,
  getLatestKmaBaseTime,
  selectWeatherPurpose,
} from "./kma-schedule";

const KMA_API_BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
export const KMA_DATASET_URL = "https://www.data.go.kr/data/15084084/openapi.do";
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000;
const DEFAULT_MAX_CACHE_ENTRIES = 128;

export const KMA_WEATHER_SOURCE: WeatherSource = Object.freeze({
  name: "기상청",
  dataset: "기상청 단기예보 조회서비스",
  sourceUrl: KMA_DATASET_URL,
  license: "제3자 권리 포함 : 저작권 표시, 공공저작물 : 출처표시 (제 1유형)",
});

type KmaWeatherErrorCode =
  | "CONFIGURATION"
  | "GRID_OUT_OF_RANGE"
  | "OUT_OF_RANGE"
  | "QUOTA"
  | "TIMEOUT"
  | "NO_DATA"
  | "UPSTREAM";

export class KmaWeatherError extends Error {
  readonly code: KmaWeatherErrorCode;

  constructor(code: KmaWeatherErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KmaWeatherError";
    this.code = code;
  }
}

type KmaItem = {
  baseDate: string;
  baseTime: string;
  category: string;
  nx: number;
  ny: number;
  obsrValue?: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
};

type CachedItems = {
  expiresAt: number;
  items: KmaItem[];
};

export type KmaWeatherClientOptions = {
  serviceKey: string | undefined;
  fetcher?: typeof fetch;
  timeoutMilliseconds?: number;
  maxCacheEntries?: number;
  now?: () => Date;
};

export type KmaWeatherRequest = {
  locationId: string;
  point: GeoPoint;
  target?: Date;
};

function operationFor(purpose: WeatherPurpose): string {
  if (purpose === "observation") return "getUltraSrtNcst";
  if (purpose === "ultra-short-forecast") return "getUltraSrtFcst";
  return "getVilageFcst";
}

function decodeServiceKey(value: string): string {
  const trimmed = value.trim();
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  // Number("") and Number(" ") are zero, but missing provider measurements
  // must stay unknown rather than imply 0°C / no wind / no precipitation.
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentage(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function nonnegative(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function skyCondition(value: unknown): WeatherSkyCondition | null {
  if (String(value) === "1") return "clear";
  if (String(value) === "3") return "mostly-cloudy";
  if (String(value) === "4") return "cloudy";
  return null;
}

function errorCodeFromBody(body: string): string | null {
  const xmlCode = /<returnReasonCode>\s*([^<]+)\s*<\/returnReasonCode>/iu.exec(body)?.[1]
    ?? /<resultCode>\s*([^<]+)\s*<\/resultCode>/iu.exec(body)?.[1];
  return xmlCode?.trim() ?? null;
}

function isSuccessfulProviderCode(code: string): boolean {
  return code === "0" || code === "00";
}

function throwForProviderCode(code: string, message: string): never {
  if (code === "22" || code === "23") {
    throw new KmaWeatherError("QUOTA", `KMA quota rejected the request (${code}): ${message}`);
  }
  if (code === "03") {
    throw new KmaWeatherError("NO_DATA", `KMA returned no data (${code}): ${message}`);
  }
  if (code === "20" || code === "30" || code === "31") {
    throw new KmaWeatherError("CONFIGURATION", `KMA rejected the service key (${code}): ${message}`);
  }
  throw new KmaWeatherError("UPSTREAM", `KMA request failed (${code}): ${message}`);
}

function parseItems(body: string): KmaItem[] {
  const xmlCode = errorCodeFromBody(body);
  if (xmlCode && !isSuccessfulProviderCode(xmlCode)) {
    throwForProviderCode(xmlCode, "XML error response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    throw new KmaWeatherError("UPSTREAM", "KMA returned malformed JSON", { cause });
  }
  if (!parsed || typeof parsed !== "object") {
    throw new KmaWeatherError("UPSTREAM", "KMA response is not an object");
  }
  const response = (parsed as { response?: unknown }).response;
  if (!response || typeof response !== "object") {
    throw new KmaWeatherError("UPSTREAM", "KMA response wrapper is missing");
  }
  const header = (response as { header?: unknown }).header;
  if (!header || typeof header !== "object") {
    throw new KmaWeatherError("UPSTREAM", "KMA response header is missing");
  }
  const resultCode = String((header as { resultCode?: unknown }).resultCode ?? "");
  const resultMessage = String((header as { resultMsg?: unknown }).resultMsg ?? "Unknown error");
  if (!isSuccessfulProviderCode(resultCode)) throwForProviderCode(resultCode, resultMessage);

  const bodyValue = (response as { body?: unknown }).body;
  const rawItems = bodyValue && typeof bodyValue === "object"
    ? (bodyValue as { items?: unknown }).items
    : undefined;
  const itemList = rawItems && typeof rawItems === "object"
    ? (rawItems as { item?: unknown }).item
    : undefined;
  if (!Array.isArray(itemList) || itemList.length === 0) {
    throw new KmaWeatherError("NO_DATA", "KMA response contains no weather items");
  }

  return itemList.flatMap((raw): KmaItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const value = raw as Record<string, unknown>;
    if (typeof value.baseDate !== "string" || typeof value.baseTime !== "string"
      || typeof value.category !== "string") return [];
    const nx = finiteNumber(value.nx);
    const ny = finiteNumber(value.ny);
    if (nx === null || ny === null) return [];
    return [{
      baseDate: value.baseDate,
      baseTime: value.baseTime,
      category: value.category,
      nx,
      ny,
      ...(value.obsrValue !== undefined ? { obsrValue: String(value.obsrValue) } : {}),
      ...(typeof value.fcstDate === "string" ? { fcstDate: value.fcstDate } : {}),
      ...(typeof value.fcstTime === "string" ? { fcstTime: value.fcstTime } : {}),
      ...(value.fcstValue !== undefined ? { fcstValue: String(value.fcstValue) } : {}),
    }];
  });
}

function valuesByCategory(items: KmaItem[], field: "obsrValue" | "fcstValue"): Map<string, string> {
  return new Map(items.flatMap((item) => {
    const value = item[field];
    return value === undefined ? [] : [[item.category, value] as const];
  }));
}

function selectForecastItems(items: KmaItem[], target: Date): { items: KmaItem[]; forecastAt: string } {
  const groups = new Map<string, KmaItem[]>();
  for (const item of items) {
    if (!item.fcstDate || !item.fcstTime) continue;
    const timestamp = formatKmaDateTime(item.fcstDate, item.fcstTime);
    if (!timestamp) continue;
    const existing = groups.get(timestamp) ?? [];
    existing.push(item);
    groups.set(timestamp, existing);
  }
  const selected = [...groups.entries()]
    .filter(([timestamp]) => new Date(timestamp).getTime() >= target.getTime())
    .sort(([left], [right]) => left.localeCompare(right))[0];
  if (!selected) {
    throw new KmaWeatherError("OUT_OF_RANGE", "KMA response does not cover the requested forecast time");
  }
  return { forecastAt: selected[0], items: selected[1] };
}

function mapWeather(
  locationId: string,
  purpose: WeatherPurpose,
  grid: WeatherGridPoint,
  issuedAt: string,
  target: Date,
  items: KmaItem[],
): LocationWeather {
  if (purpose === "observation") {
    const values = valuesByCategory(items, "obsrValue");
    return {
      locationId,
      purpose,
      grid,
      issuedAt,
      observedAt: issuedAt,
      forecastAt: null,
      temperatureCelsius: finiteNumber(values.get("T1H")),
      skyCondition: null,
      precipitationProbabilityPercent: null,
      windSpeedMetersPerSecond: nonnegative(values.get("WSD")),
      humidityPercent: percentage(values.get("REH")),
      source: KMA_WEATHER_SOURCE,
    };
  }

  const selected = selectForecastItems(items, target);
  const values = valuesByCategory(selected.items, "fcstValue");
  return {
    locationId,
    purpose,
    grid,
    issuedAt,
    observedAt: null,
    forecastAt: selected.forecastAt,
    temperatureCelsius: finiteNumber(values.get(purpose === "short-forecast" ? "TMP" : "T1H")),
    skyCondition: skyCondition(values.get("SKY")),
    precipitationProbabilityPercent: percentage(values.get("POP")),
    windSpeedMetersPerSecond: nonnegative(values.get("WSD")),
    humidityPercent: percentage(values.get("REH")),
    source: KMA_WEATHER_SOURCE,
  };
}

export class KmaWeatherClient {
  private readonly serviceKey: string | undefined;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMilliseconds: number;
  private readonly maxCacheEntries: number;
  private readonly clock: () => Date;
  private readonly cache = new Map<string, CachedItems>();
  private readonly inflight = new Map<string, Promise<KmaItem[]>>();

  constructor(options: KmaWeatherClientOptions) {
    this.serviceKey = options.serviceKey ? decodeServiceKey(options.serviceKey) : undefined;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.clock = options.now ?? (() => new Date());
  }

  async getWeather(request: KmaWeatherRequest): Promise<LocationWeather> {
    if (!this.serviceKey) {
      throw new KmaWeatherError("CONFIGURATION", "KMA_VILLAGE_FORECAST_SERVICE_KEY is not configured");
    }
    const now = this.clock();
    const target = request.target ?? now;
    const selection = selectWeatherPurpose(target, now);
    if (!selection.ok) {
      throw new KmaWeatherError("OUT_OF_RANGE", `Requested weather time is outside the supported ${selection.reason} range`);
    }
    const grid = toKmaGrid(request.point);
    if (!grid) throw new KmaWeatherError("GRID_OUT_OF_RANGE", "Location is outside the KMA forecast grid");
    const base = getLatestKmaBaseTime(selection.purpose, now);
    const items = await this.getItems(selection.purpose, grid, base.baseDate, base.baseTime, base.nextReleaseAt);
    return mapWeather(request.locationId, selection.purpose, grid, base.issuedAt, target, items);
  }

  private async getItems(
    purpose: WeatherPurpose,
    grid: WeatherGridPoint,
    baseDate: string,
    baseTime: string,
    nextReleaseAt: Date,
  ): Promise<KmaItem[]> {
    const key = `${purpose}:${grid.x}:${grid.y}:${baseDate}:${baseTime}`;
    const now = this.clock().getTime();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.items;
    if (cached) this.cache.delete(key);
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const request = this.fetchItems(purpose, grid, baseDate, baseTime)
      .then((items) => {
        this.cache.set(key, { items, expiresAt: Math.max(now + 1_000, nextReleaseAt.getTime()) });
        while (this.cache.size > Math.max(1, this.maxCacheEntries)) {
          const oldest = this.cache.keys().next().value;
          if (oldest === undefined) break;
          this.cache.delete(oldest);
        }
        return items;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }

  private async fetchItems(
    purpose: WeatherPurpose,
    grid: WeatherGridPoint,
    baseDate: string,
    baseTime: string,
  ): Promise<KmaItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    const url = new URL(`${KMA_API_BASE_URL}/${operationFor(purpose)}`);
    url.search = new URLSearchParams({
      serviceKey: this.serviceKey!,
      pageNo: "1",
      numOfRows: "1000",
      dataType: "JSON",
      base_date: baseDate,
      base_time: baseTime,
      nx: String(grid.x),
      ny: String(grid.y),
    }).toString();
    try {
      const response = await this.fetcher(url, { signal: controller.signal });
      const body = await response.text();
      if (!response.ok) {
        const providerCode = errorCodeFromBody(body);
        if (providerCode) throwForProviderCode(providerCode, `HTTP ${response.status}`);
        throw new KmaWeatherError("UPSTREAM", `KMA returned HTTP ${response.status}`);
      }
      return parseItems(body);
    } catch (error) {
      if (error instanceof KmaWeatherError) throw error;
      if (controller.signal.aborted) {
        throw new KmaWeatherError("TIMEOUT", "KMA request timed out", { cause: error });
      }
      throw new KmaWeatherError("UPSTREAM", "KMA request failed", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

let sharedClient: KmaWeatherClient | undefined;

export function getKmaWeatherClient(): KmaWeatherClient {
  sharedClient ??= new KmaWeatherClient({
    serviceKey: serverEnv.kmaVillageForecastServiceKey,
  });
  return sharedClient;
}
