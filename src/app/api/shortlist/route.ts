import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import {
  createSupabaseUserShortlistRepository,
  type UserShortlistRepository,
} from "@/domains/users/server/shortlist-repository";
import { getVerifiedAuthUser } from "@/infrastructure/supabase/auth-verification";
import { createSupabaseRequestAuthClientFromCookies } from "@/infrastructure/supabase/request-auth-client";
import { ApplicationError, dataAccessError, unauthenticatedError, validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { applyPrivateResponseCacheHeaders } from "@/shared/http/private-cache";
import { assertSameOriginMutation } from "@/shared/http/same-origin-mutation";
import {
  MAX_SHORTLIST_REQUEST_BYTES,
  SHORTLIST_WRITE_CSRF_HEADER,
  SHORTLIST_WRITE_CSRF_VALUE,
  shortlistMergeRequestSchema,
  shortlistMutationRequestSchema,
  type ShortlistMergeRequest,
  type ShortlistMergeResponse,
  type ShortlistMutationRequest,
  type ShortlistResponse,
} from "@/types/contracts";

export const dynamic = "force-dynamic";

type CookieMutation = { name: string; value: string; options?: CookieOptions };

export type ShortlistRouteDependencies = {
  createAuthClient: typeof createSupabaseRequestAuthClientFromCookies;
  verifyUser: (client: SupabaseClient | null) => Promise<User | null>;
  createRepository: (client: SupabaseClient) => UserShortlistRepository;
};

const defaultDependencies: ShortlistRouteDependencies = {
  createAuthClient: createSupabaseRequestAuthClientFromCookies,
  verifyUser: getVerifiedAuthUser,
  createRepository: createSupabaseUserShortlistRepository,
};

function applyPrivateHeaders(response: NextResponse): NextResponse {
  applyPrivateResponseCacheHeaders(response.headers);
  const vary = new Set((response.headers.get("Vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  vary.add("Origin");
  response.headers.set("Vary", [...vary].join(", "));
  return response;
}

function applyCookieMutations(response: NextResponse, mutations: CookieMutation[]): void {
  for (const mutation of mutations) response.cookies.set(mutation.name, mutation.value, mutation.options);
}

async function readJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw validationError("관심 장소 요청 형식이 올바르지 않습니다.");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SHORTLIST_REQUEST_BYTES) {
    throw validationError("관심 장소 요청이 너무 큽니다.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_SHORTLIST_REQUEST_BYTES) {
    throw validationError("관심 장소 요청이 너무 큽니다.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw validationError("관심 장소 요청 형식이 올바르지 않습니다.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw validationError("관심 장소 요청 값이 올바르지 않습니다.");
  return parsed.data;
}

async function runAuthenticated(
  request: NextRequest,
  dependencies: ShortlistRouteDependencies,
  operation: string,
  action: (repository: UserShortlistRepository, user: User) => Promise<NextResponse>,
): Promise<NextResponse> {
  const cookieMutations: CookieMutation[] = [];
  try {
    const authClient = dependencies.createAuthClient({
      getAll: () => request.cookies.getAll(),
      set(name, value, options) {
        request.cookies.set(name, value);
        cookieMutations.push({ name, value, options });
      },
    });
    const user = await dependencies.verifyUser(authClient);
    if (!authClient || !user) throw unauthenticatedError("A fresh user is required for shortlist access");
    const response = await action(dependencies.createRepository(authClient), user);
    applyCookieMutations(response, cookieMutations);
    return applyPrivateHeaders(response);
  } catch (error) {
    const safeError = error instanceof ApplicationError
      ? error
      : dataAccessError(`Unexpected ${operation} failure`, error);
    const response = apiErrorResponse(safeError, operation);
    applyCookieMutations(response, cookieMutations);
    return applyPrivateHeaders(response);
  }
}

export function handleGetShortlist(
  request: NextRequest,
  dependencies: ShortlistRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  return runAuthenticated(request, dependencies, "shortlist.list", async (repository, user) => {
    const ids = await repository.list(user.id);
    return NextResponse.json({ ids } satisfies ShortlistResponse);
  });
}

export async function handlePutShortlist(
  request: NextRequest,
  dependencies: ShortlistRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  try {
    assertSameOriginMutation(request, {
      csrfHeader: SHORTLIST_WRITE_CSRF_HEADER,
      csrfValue: SHORTLIST_WRITE_CSRF_VALUE,
      operation: "Shortlist mutation",
    });
    const input = await readJson<ShortlistMutationRequest>(request, shortlistMutationRequestSchema);
    return runAuthenticated(request, dependencies, "shortlist.set", async (repository, user) => {
      const ids = await repository.setSaved(user.id, input.locationId, input.saved);
      return NextResponse.json({ ids } satisfies ShortlistResponse);
    });
  } catch (error) {
    const response = apiErrorResponse(error, "shortlist.set.validate");
    return applyPrivateHeaders(response);
  }
}

export async function handlePostShortlist(
  request: NextRequest,
  dependencies: ShortlistRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  try {
    assertSameOriginMutation(request, {
      csrfHeader: SHORTLIST_WRITE_CSRF_HEADER,
      csrfValue: SHORTLIST_WRITE_CSRF_VALUE,
      operation: "Shortlist merge",
    });
    const input = await readJson<ShortlistMergeRequest>(request, shortlistMergeRequestSchema);
    return runAuthenticated(request, dependencies, "shortlist.merge", async (repository, user) => {
      const result = await repository.merge(user.id, input.locationIds);
      return NextResponse.json(result satisfies ShortlistMergeResponse);
    });
  } catch (error) {
    const response = apiErrorResponse(error, "shortlist.merge.validate");
    return applyPrivateHeaders(response);
  }
}

export function GET(request: NextRequest): Promise<NextResponse> {
  return handleGetShortlist(request);
}

export function PUT(request: NextRequest): Promise<NextResponse> {
  return handlePutShortlist(request);
}

export function POST(request: NextRequest): Promise<NextResponse> {
  return handlePostShortlist(request);
}
