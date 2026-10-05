import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicAuthConfig, type SupabasePublicAuthConfig } from "./auth-config";

export type RequestCookieStore = {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string, options?: CookieOptions): void;
};

/** A fresh instance is required for every server request; never memoize it. */
export function createSupabaseRequestAuthClientFromCookies(
  cookieStore: RequestCookieStore,
  config: SupabasePublicAuthConfig | null = getSupabasePublicAuthConfig(),
): SupabaseClient | null {
  if (!config) return null;

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The root proxy refreshes
          // and persists sessions before rendering; Route Handlers can write.
        }
      },
    },
  });
}

export async function createSupabaseRequestAuthClient(): Promise<SupabaseClient | null> {
  const cookieStore = await cookies();
  return createSupabaseRequestAuthClientFromCookies(cookieStore);
}
