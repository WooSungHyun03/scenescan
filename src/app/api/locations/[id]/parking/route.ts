import { NextResponse } from "next/server";

import { getNearbyParking } from "@/domains/locations/server/parking";
import { validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { locationIdSchema } from "@/types/contracts";
import { nearbyParkingQuerySchema, nearbyParkingResponseSchema } from "@/types/place-discovery";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = locationIdSchema.safeParse(id);
  if (!parsedId.success) {
    return apiErrorResponse(
      validationError("장소 ID 형식이 올바르지 않습니다."),
      "locations.parking.validate",
    );
  }

  const parsedQuery = nearbyParkingQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsedQuery.success) {
    return apiErrorResponse(
      validationError("주차장 검색 반경은 100m 이상 20km 이하의 정수여야 합니다."),
      "locations.parking.validate",
    );
  }

  try {
    const response = nearbyParkingResponseSchema.parse(await getNearbyParking(
      parsedId.data,
      parsedQuery.data.radius,
      request.signal,
    ));
    return NextResponse.json(response, {
      // Kakao Local candidates are transient and are never used as a stored catalogue.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "locations.parking.execute");
  }
}
