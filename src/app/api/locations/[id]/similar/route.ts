import { NextResponse } from "next/server";
import { getLocation, getSimilarLocations } from "@/domains/locations/server/repository";
import { notFoundError, validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { locationIdSchema } from "@/types/contracts";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const idResult = locationIdSchema.safeParse(id);
  if (!idResult.success) {
    return apiErrorResponse(validationError("장소 ID 형식이 올바르지 않습니다."), "locations.similar.validate");
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
    const results = await getSimilarLocations(idResult.data);
    return NextResponse.json({ results });
  } catch (error) {
    return apiErrorResponse(error, "locations.similar.execute");
  }
}
