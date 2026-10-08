import { NextResponse } from "next/server";
import { z } from "zod";
import { getLocations, getLocationsByIds } from "@/domains/locations/server/repository";
import { locationIdSchema, locationListQuerySchema, type LocationListResponse } from "@/types/contracts";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { validationError } from "@/shared/errors/application-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ids = params.getAll("id");
  const parsed = ids.length
    ? z.array(locationIdSchema).max(50).safeParse(ids)
    : locationListQuerySchema.safeParse({
        region: params.get("region") ?? undefined,
        district: params.get("district") ?? undefined,
        category: params.get("category") ?? undefined,
        limit: params.has("limit") ? Number(params.get("limit")) : undefined,
        offset: params.has("offset") ? Number(params.get("offset")) : undefined,
      });
  if (!parsed.success) return apiErrorResponse(validationError("장소 조회 조건이 올바르지 않습니다."), "locations.list.validate");
  try {
    if (Array.isArray(parsed.data)) {
      const locations = await getLocationsByIds([...new Set(parsed.data)]);
      return NextResponse.json({ locations, filters: {} } satisfies LocationListResponse);
    }
    const locations = await getLocations(parsed.data);
    return NextResponse.json({ locations, filters: { region: parsed.data.region, district: parsed.data.district, category: parsed.data.category } } satisfies LocationListResponse);
  } catch (error) {
    return apiErrorResponse(error, "locations.list.execute");
  }
}
