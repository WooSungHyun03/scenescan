import "server-only";

import {
  configurationError,
  dataAccessError,
  notFoundError,
  rateLimitedError,
  validationError,
} from "@/shared/errors/application-error";
import {
  getKmaWeatherClient,
  KmaWeatherError,
  type KmaWeatherClient,
} from "@/infrastructure/weather/kma-client";
import type { Location } from "@/types/domain";
import type { LocationWeather } from "@/types/weather";
import { getLocation } from "./repository";

export type LocationWeatherDependencies = {
  findLocation: (id: string) => Promise<Location | null>;
  weatherClient: Pick<KmaWeatherClient, "getWeather">;
};

const defaultDependencies: LocationWeatherDependencies = {
  findLocation: getLocation,
  weatherClient: { getWeather: (request) => getKmaWeatherClient().getWeather(request) },
};

export async function getLocationWeather(
  locationId: string,
  target?: Date,
  dependencies: LocationWeatherDependencies = defaultDependencies,
): Promise<LocationWeather> {
  const location = await dependencies.findLocation(locationId);
  if (!location) throw notFoundError(`Location ${locationId} not found`);

  try {
    return await dependencies.weatherClient.getWeather({
      locationId,
      point: location.point,
      ...(target ? { target } : {}),
    });
  } catch (error) {
    if (!(error instanceof KmaWeatherError)) {
      throw dataAccessError("Unexpected weather adapter failure", error);
    }
    switch (error.code) {
      case "OUT_OF_RANGE":
        throw validationError("조회 시각은 최근 1시간부터 향후 4일 범위로 지정해 주세요.");
      case "GRID_OUT_OF_RANGE":
        throw validationError("이 장소는 기상청 격자 예보 범위 밖에 있습니다.");
      case "QUOTA":
        throw rateLimitedError("KMA weather API quota exceeded", 60);
      case "CONFIGURATION":
        throw configurationError("KMA weather service key is unavailable or rejected");
      case "TIMEOUT":
      case "NO_DATA":
      case "UPSTREAM":
        throw dataAccessError(`KMA weather request failed: ${error.code}`, error);
    }
  }
}
