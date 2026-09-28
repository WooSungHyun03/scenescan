import { NextResponse } from "next/server";
import { getSimilarLocations } from "@/domains/locations/server/repository";
import { badRequest } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import type { SimilarLocationsResponse } from "@/types/contracts";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = rawId.trim();

  if (!id) {
    return apiErrorResponse(
      badRequest("Location ID is required"),
      "similar-locations.validate",
    );
  }

  try {
    const results = (await getSimilarLocations(id))
      .filter(({ location }) => location.id !== id)
      .slice(0, 8);
    const response: SimilarLocationsResponse = { results };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "similar-locations.execute");
  }
}
