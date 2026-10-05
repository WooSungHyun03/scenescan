import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { deleteAuthenticatedAccount } from "@/domains/users/server/account-deletion";
import { getSupabaseAdminClient } from "@/infrastructure/supabase/admin-client";
import { isSupabaseAuthCookie } from "@/infrastructure/supabase/auth-cache";
import { createSupabaseRequestAuthClientFromCookies } from "@/infrastructure/supabase/request-auth-client";
import { ApplicationError, dataAccessError, forbiddenError, validationError } from "@/shared/errors/application-error";
import { apiErrorResponse } from "@/shared/http/api-error-response";
import { applyPrivateResponseCacheHeaders } from "@/shared/http/private-cache";
import {
  ACCOUNT_DELETION_CSRF_HEADER,
  ACCOUNT_DELETION_CSRF_VALUE,
  accountDeletionRequestSchema,
  MAX_ACCOUNT_DELETION_REQUEST_BYTES,
  type AccountDeletionResponse,
} from "@/types/contracts";

export const dynamic = "force-dynamic";

type CookieMutation = { name: string; value: string; options?: CookieOptions };
export type AccountRouteDependencies = {
  createAuthClient: typeof createSupabaseRequestAuthClientFromCookies;
  getAdminClient: () => SupabaseClient;
  deleteAccount: typeof deleteAuthenticatedAccount;
};

const defaultDependencies: AccountRouteDependencies = {
  createAuthClient: createSupabaseRequestAuthClientFromCookies,
  getAdminClient: getSupabaseAdminClient,
  deleteAccount: deleteAuthenticatedAccount,
};

function addVaryOrigin(headers: Headers): void {
  const values = new Set(
    (headers.get("Vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  );
  values.add("Origin");
  headers.set("Vary", [...values].join(", "));
}

function applyPrivateHeaders(response: NextResponse): NextResponse {
  applyPrivateResponseCacheHeaders(response.headers);
  addVaryOrigin(response.headers);
  return response;
}

function assertSameOriginMutation(request: NextRequest): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  let originUrl: URL | null = null;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {
    originUrl = null;
  }
  const requestHosts = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim(),
  ].filter((host): host is string => Boolean(host));
  if (requestHosts.length === 0) requestHosts.push(request.nextUrl.host);
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const requestProtocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : request.nextUrl.protocol.replace(":", "");
  if (
    !originUrl
    || !requestHosts.includes(originUrl.host)
    || requestProtocol !== originUrl.protocol.replace(":", "")
  ) {
    throw forbiddenError("Account deletion rejected a missing or cross-origin Origin header");
  }
  if (fetchSite && fetchSite !== "same-origin") {
    throw forbiddenError("Account deletion rejected a cross-site Fetch Metadata value");
  }
  if (request.headers.get(ACCOUNT_DELETION_CSRF_HEADER) !== ACCOUNT_DELETION_CSRF_VALUE) {
    throw forbiddenError("Account deletion rejected a missing CSRF request header");
  }
}

async function readDeletionRequest(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw validationError("회원탈퇴 요청 형식이 올바르지 않습니다.");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ACCOUNT_DELETION_REQUEST_BYTES) {
    throw validationError("회원탈퇴 요청이 너무 큽니다.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_ACCOUNT_DELETION_REQUEST_BYTES) {
    throw validationError("회원탈퇴 요청이 너무 큽니다.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw validationError("회원탈퇴 요청 형식이 올바르지 않습니다.");
  }
  const parsed = accountDeletionRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError("현재 비밀번호와 확인 문구를 정확히 입력해 주세요.");
  return parsed.data;
}

function applyCookieMutations(response: NextResponse, mutations: CookieMutation[]): void {
  for (const mutation of mutations) {
    response.cookies.set(mutation.name, mutation.value, mutation.options);
  }
}

function clearAuthCookies(response: NextResponse, names: ReadonlySet<string>, secure: boolean): void {
  for (const name of names) {
    response.cookies.set({
      name,
      value: "",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure,
    });
  }
}

export async function handleDeleteAccount(
  request: NextRequest,
  dependencies: AccountRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  const cookieMutations: CookieMutation[] = [];
  const authCookieNames = new Set(
    request.cookies.getAll().map(({ name }) => name).filter(isSupabaseAuthCookie),
  );

  try {
    assertSameOriginMutation(request);
    const input = await readDeletionRequest(request);
    const authClient = dependencies.createAuthClient({
      getAll: () => request.cookies.getAll(),
      set(name, value, options) {
        request.cookies.set(name, value);
        cookieMutations.push({ name, value, options });
        if (isSupabaseAuthCookie(name)) authCookieNames.add(name);
      },
    });
    await dependencies.deleteAccount(authClient, dependencies.getAdminClient, input.currentPassword);

    const response = NextResponse.json({ deleted: true } satisfies AccountDeletionResponse);
    clearAuthCookies(response, authCookieNames, request.nextUrl.protocol === "https:");
    response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
    return applyPrivateHeaders(response);
  } catch (error) {
    const safeError = error instanceof ApplicationError
      ? error
      : dataAccessError("Unexpected account deletion failure", error);
    const response = apiErrorResponse(safeError, "account.delete");
    applyCookieMutations(response, cookieMutations);
    return applyPrivateHeaders(response);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return handleDeleteAccount(request);
}
