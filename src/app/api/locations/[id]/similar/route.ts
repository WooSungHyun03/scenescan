import { NextResponse } from "next/server";
import { getLocation, getSimilarLocations } from "@/domains/locations/server/repository";
import { notFoundError, validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { locationIdSchema, type SimilarLocationsResponse } from "@/types/contracts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const idResult = locationIdSchema.safeParse(id);
  if (!idResult.success) {
    return apiErrorResponse(validationError("장소 ID 형식이 올바르지 않습니다."), "locations.similar.validate");
  }

  const excluded = new URL(request.url).searchParams.getAll("exclude");
  if (excluded.length > 200 || excluded.some((value) => !locationIdSchema.safeParse(value).success)) {
    return apiErrorResponse(validationError("제외할 장소는 올바른 ID로 최대 200개까지 지정해 주세요."), "locations.similar.validate");
  }
  try {
    // Existence check reuses getLocation (already mode-aware, already
    // distinguishes found/not-found) rather than having
    // getSimilarLocations itself return null vs [] -- an existing but
    // embedding-less location must return [] (not an error, not 404); only
    // a genuinely nonexistent location is LOCATION_NOT_FOUND.
    const location = await getLocation(idResult.data);
    if (!location) {
      return apiErrorResponse(notFoundError(`Location ${idResult.data} not found`), "locations.similar.not-found");
    }
    const results = await getSimilarLocations(idResult.data, [...new Set(excluded)]);
    const response: SimilarLocationsResponse = { results };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "locations.similar.execute");
  }
}
