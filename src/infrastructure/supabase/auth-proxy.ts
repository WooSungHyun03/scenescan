import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { applyPrivateResponseCacheHeaders } from "@/shared/http/private-cache";
import { getSupabasePublicAuthConfig, type SupabasePublicAuthConfig } from "./auth-config";
import { isSupabaseAuthCookie } from "./auth-cache";

type ProxyCookieAdapter = {
  getAll(): Array<{ name: string; value: string }>;
  setAll(
    cookies: Array<{ name: string; value: string; options: CookieOptions }>,
    headers: Record<string, string>,
  ): void;
};

export type ProxyAuthClient = {
  auth: {
    getClaims(): Promise<{
      data: { claims?: { sub?: string } } | null;
      error: unknown;
    }>;
  };
};

export type ProxyAuthClientFactory = (cookies: ProxyCookieAdapter) => ProxyAuthClient;

function createProductionProxyClient(
  config: SupabasePublicAuthConfig,
): ProxyAuthClientFactory {
  return (cookieAdapter) => createServerClient(
    config.url,
    config.publishableKey,
    { cookies: cookieAdapter },
  );
}

export async function refreshSupabaseAuthSession(
  request: NextRequest,
  options: {
    config?: SupabasePublicAuthConfig | null;
    createClient?: ProxyAuthClientFactory;
  } = {},
): Promise<NextResponse> {
  const config = options.config === undefined
    ? getSupabasePublicAuthConfig()
    : options.config;
  let response = NextResponse.next({ request });
  if (!config) return response;

  const arrivedWithAuthCookies = request.cookies
    .getAll()
    .some(({ name }) => isSupabaseAuthCookie(name));
  let wroteAuthCookies = false;
  const factory = options.createClient ?? createProductionProxyClient(config);
  const client = factory({
    getAll: () => request.cookies.getAll(),
    setAll(cookiesToSet, cacheHeaders) {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }
      response = NextResponse.next({ request });
      for (const { name, value, options: cookieOptions } of cookiesToSet) {
        response.cookies.set(name, value, cookieOptions);
        if (isSupabaseAuthCookie(name)) wroteAuthCookies = true;
      }
      for (const [name, value] of Object.entries(cacheHeaders)) {
        response.headers.set(name, value);
      }
    },
  });

  let hasVerifiedIdentity = false;
  try {
    const { data, error } = await client.auth.getClaims();
    hasVerifiedIdentity = !error && Boolean(data?.claims?.sub);
  } catch {
    // Fail closed: an Auth outage or malformed/forged cookie never grants an
    // identity. Public browsing remains available.
  }

  if (hasVerifiedIdentity || arrivedWithAuthCookies || wroteAuthCookies) {
    applyPrivateResponseCacheHeaders(response.headers);
  }

  return response;
}
