"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicAuthConfig } from "./auth-config";

let browserAuthClient: SupabaseClient | null | undefined;

/**
 * Returns one cookie-backed auth client per browser tab. Supabase handles
 * token refresh coordination between tabs; the server still validates claims
 * independently on every authenticated request.
 */
export function getSupabaseBrowserAuthClient(): SupabaseClient | null {
  if (browserAuthClient !== undefined) return browserAuthClient;

  const config = getSupabasePublicAuthConfig();
  browserAuthClient = config
    ? createBrowserClient(config.url, config.publishableKey, {
        isSingleton: true,
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
  return browserAuthClient;
}
