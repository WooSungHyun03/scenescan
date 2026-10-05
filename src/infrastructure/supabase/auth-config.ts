import { publicEnv } from "@/env/public";

export type SupabasePublicAuthConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

/**
 * Auth is optional for the public MVP. Keyless mock mode returns null instead
 * of constructing a partially configured client.
 */
export function getSupabasePublicAuthConfig(): SupabasePublicAuthConfig | null {
  if (!publicEnv.supabaseUrl || !publicEnv.supabasePublishableKey) return null;
  return Object.freeze({
    url: publicEnv.supabaseUrl,
    publishableKey: publicEnv.supabasePublishableKey,
  });
}
