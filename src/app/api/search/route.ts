import { NextResponse } from "next/server";
import { searchByImage } from "@/domains/locations/server/repository";
import { badRequest } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { searchRequestSchema } from "@/types/contracts";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiErrorResponse(badRequest("Invalid JSON"), "search.parse"); }
  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) return apiErrorResponse(badRequest("Invalid search request"), "search.validate");
  try {
    const results = await searchByImage(parsed.data.embedding, parsed.data.filters);
    return NextResponse.json({ results });
  } catch (error) {
    return apiErrorResponse(error, "search.execute");
  }
}
