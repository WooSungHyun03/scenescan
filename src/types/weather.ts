import { z } from "zod";

export const WEATHER_PURPOSE_VALUES = [
  "observation",
  "ultra-short-forecast",
  "short-forecast",
] as const;

export type WeatherPurpose = (typeof WEATHER_PURPOSE_VALUES)[number];

export type WeatherSkyCondition = "clear" | "mostly-cloudy" | "cloudy";

export interface WeatherGridPoint {
  x: number;
  y: number;
}

export interface WeatherSource {
  name: "기상청";
  dataset: "기상청 단기예보 조회서비스";
  sourceUrl: string;
  license: "제3자 권리 포함 : 저작권 표시, 공공저작물 : 출처표시 (제 1유형)";
}

/**
 * A single KMA observation or forecast selected for a location and target
 * instant. Missing provider categories stay null; SceneScan never estimates
 * a value that was absent from the official response.
 */
export interface LocationWeather {
  locationId: string;
  purpose: WeatherPurpose;
  grid: WeatherGridPoint;
  issuedAt: string;
  observedAt: string | null;
  forecastAt: string | null;
  temperatureCelsius: number | null;
  skyCondition: WeatherSkyCondition | null;
  precipitationProbabilityPercent: number | null;
  windSpeedMetersPerSecond: number | null;
  humidityPercent: number | null;
  source: WeatherSource;
}

export interface LocationWeatherResponse {
  weather: LocationWeather;
}

/** Client boundary: reject malformed measurements before displaying them. */
export const locationWeatherResponseSchema = z.object({
  weather: z.object({
    locationId: z.uuid(),
    purpose: z.enum(WEATHER_PURPOSE_VALUES),
    grid: z.object({ x: z.number().int().positive(), y: z.number().int().positive() }),
    issuedAt: z.iso.datetime({ offset: true }),
    observedAt: z.iso.datetime({ offset: true }).nullable(),
    forecastAt: z.iso.datetime({ offset: true }).nullable(),
    temperatureCelsius: z.number().finite().nullable(),
    skyCondition: z.enum(["clear", "mostly-cloudy", "cloudy"]).nullable(),
    precipitationProbabilityPercent: z.number().min(0).max(100).nullable(),
    windSpeedMetersPerSecond: z.number().nonnegative().nullable(),
    humidityPercent: z.number().min(0).max(100).nullable(),
    source: z.object({
      name: z.literal("기상청"),
      dataset: z.literal("기상청 단기예보 조회서비스"),
      sourceUrl: z.url({ protocol: /^https?$/ }),
      license: z.literal("제3자 권리 포함 : 저작권 표시, 공공저작물 : 출처표시 (제 1유형)"),
    }),
  }).refine((weather) => weather.purpose === "observation"
    ? weather.observedAt !== null && weather.forecastAt === null
    : weather.forecastAt !== null && weather.observedAt === null,
  { message: "Observation and forecast timestamps must match the weather purpose" }),
}) satisfies z.ZodType<LocationWeatherResponse>;

// An explicit offset is required so a caller cannot accidentally submit a
// browser-local wall time and move the requested Korean forecast instant.
export const locationWeatherQuerySchema = z.object({
  at: z.iso.datetime({ offset: true }).optional(),
}).strict();

export type LocationWeatherQuery = z.infer<typeof locationWeatherQuerySchema>;
