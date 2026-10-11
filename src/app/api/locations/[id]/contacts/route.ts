import { NextResponse } from "next/server";
import { getLocationContacts } from "@/domains/locations/server/contacts";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { validationError } from "@/shared/errors/application-error";
import { locationIdSchema } from "@/types/contracts";
import { locationContactsResponseSchema } from "@/types/location-contact";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedId = locationIdSchema.safeParse(id);
  if (!parsedId.success) {
    return apiErrorResponse(
      validationError("장소 ID 형식이 올바르지 않습니다."),
      "locations.contacts.validate",
    );
  }
  if (new URL(request.url).searchParams.size > 0) {
    return apiErrorResponse(
      validationError("연락처 조회는 쿼리 파라미터를 지원하지 않습니다."),
      "locations.contacts.validate",
    );
  }

  try {
    const response = locationContactsResponseSchema.parse(
      await getLocationContacts(parsedId.data, request.signal),
    );
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "locations.contacts.execute");
  }
}
