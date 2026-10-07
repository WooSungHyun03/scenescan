import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isExpiredAuthCallback } from "@/domains/users/services/auth-error";
import { completeSupabaseAuthCallback } from "@/infrastructure/supabase/auth-callback";
import { createSupabaseRequestAuthClientFromCookies } from "@/infrastructure/supabase/request-auth-client";
import { applyPrivateResponseCacheHeaders } from "@/shared/http/private-cache";

const recoveryOtpTypes = new Set<EmailOtpType>(["recovery"]);

function redirect(request: NextRequest, response: NextResponse, destination: string): NextResponse {
  // Keep callbacks on the browser's origin, not the container listen address.
  const target = new URL(destination, request.url);
  response.headers.set("Location", `${target.pathname}${target.search}`);
  applyPrivateResponseCacheHeaders(response.headers);
  return response;
}

function recoveryErrorPath(code: "auth_unavailable" | "recovery_expired" | "recovery_invalid"): string {
  return `/forgot-password?error=${code}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL("/recovery", request.url));
  applyPrivateResponseCacheHeaders(response.headers);

  const providerError = request.nextUrl.searchParams.get("error_code")
    ?? request.nextUrl.searchParams.get("error");
  if (providerError) {
    return redirect(
      request,
      response,
      recoveryErrorPath(isExpiredAuthCallback({ code: providerError }) ? "recovery_expired" : "recovery_invalid"),
    );
  }

  const client = createSupabaseRequestAuthClientFromCookies({
    getAll: () => request.cookies.getAll(),
    set(name, value, options) {
      request.cookies.set(name, value);
      response.cookies.set(name, value, options);
    },
  });
  if (!client) return redirect(request, response, recoveryErrorPath("auth_unavailable"));

  try {
    const { error } = await completeSupabaseAuthCallback(
      client,
      request.nextUrl.searchParams,
      recoveryOtpTypes,
    );
    if (!error) return redirect(request, response, "/recovery");
    return redirect(
      request,
      response,
      recoveryErrorPath(isExpiredAuthCallback(error) ? "recovery_expired" : "recovery_invalid"),
    );
  } catch {
    return redirect(request, response, recoveryErrorPath("recovery_invalid"));
  }
}
