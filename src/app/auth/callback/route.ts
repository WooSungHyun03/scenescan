import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSafeAuthRedirect } from "@/domains/users/services/auth-redirect";
import { isExpiredAuthCallback } from "@/domains/users/services/auth-error";
import { completeSupabaseAuthCallback } from "@/infrastructure/supabase/auth-callback";
import { createSupabaseRequestAuthClientFromCookies } from "@/infrastructure/supabase/request-auth-client";
import { applyPrivateResponseCacheHeaders } from "@/shared/http/private-cache";

const emailOtpTypes = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "signup",
]);

function setRedirect(response: NextResponse, request: NextRequest, destination: string): NextResponse {
  // A relative Location preserves the browser's origin even when standalone
  // Next.js constructs request.url from its internal 0.0.0.0 listen address.
  const target = new URL(destination, request.url);
  response.headers.set("Location", `${target.pathname}${target.search}`);
  applyPrivateResponseCacheHeaders(response.headers);
  return response;
}

function loginErrorPath(code: "auth_unavailable" | "callback_expired" | "callback_invalid", next: string): string {
  const query = new URLSearchParams({ error: code, next });
  return `/login?${query.toString()}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const next = getSafeAuthRedirect(request.nextUrl.searchParams.get("next"), "/account?confirmed=1");
  const response = NextResponse.redirect(new URL(next, request.url));
  applyPrivateResponseCacheHeaders(response.headers);

  const providerError = request.nextUrl.searchParams.get("error_code")
    ?? request.nextUrl.searchParams.get("error");
  if (providerError) {
    return setRedirect(
      response,
      request,
      loginErrorPath(
        isExpiredAuthCallback({ code: providerError }) ? "callback_expired" : "callback_invalid",
        next,
      ),
    );
  }

  const client = createSupabaseRequestAuthClientFromCookies({
    getAll: () => request.cookies.getAll(),
    set(name, value, options) {
      request.cookies.set(name, value);
      response.cookies.set(name, value, options);
    },
  });
  if (!client) {
    return setRedirect(response, request, loginErrorPath("auth_unavailable", next));
  }

  try {
    const { error } = await completeSupabaseAuthCallback(client, request.nextUrl.searchParams, emailOtpTypes);
    if (!error) return setRedirect(response, request, next);
    return setRedirect(
      response,
      request,
      loginErrorPath(isExpiredAuthCallback(error) ? "callback_expired" : "callback_invalid", next),
    );
  } catch {
    return setRedirect(response, request, loginErrorPath("callback_invalid", next));
  }
}
