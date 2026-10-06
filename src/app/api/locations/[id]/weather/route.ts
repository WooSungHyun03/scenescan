import { NextResponse } from "next/server";

import { getLocationWeather } from "@/domains/locations/server/weather";
import { validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { locationIdSchema } from "@/types/contracts";
import {
  locationWeatherQuerySchema,
  type LocationWeatherResponse,
} from "@/types/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = locationIdSchema.safeParse(id);
  if (!parsedId.success) {
    return apiErrorResponse(
      validationError("장소 ID 형식이 올바르지 않습니다."),
      "locations.weather.validate",
    );
  }

  const parsedQuery = locationWeatherQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsedQuery.success) {
    return apiErrorResponse(
      validationError("조회 시각은 UTC 오프셋을 포함한 ISO 8601 형식이어야 합니다."),
      "locations.weather.validate",
    );
  }

  try {
    const weather = await getLocationWeather(
      parsedId.data,
      parsedQuery.data.at ? new Date(parsedQuery.data.at) : undefined,
    );
    const response: LocationWeatherResponse = { weather };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (error) {
    return apiErrorResponse(error, "locations.weather.execute");
  }
}
