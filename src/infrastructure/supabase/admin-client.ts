import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/env/server";
import { configurationError } from "@/shared/errors/application-error";

/**
 * Service-role Supabase client for privileged server-side operations only
 * (the self-service DELETE /api/account route and controlled maintenance
 * tasks run from within the Next.js app). Public read paths still go through
 * the publishable-key client in ./server-client, which is what RLS expects.
 *
 * The `server-only` import above makes it a build-time error for any Client
 * Component to import this module (directly or transitively), which is the
 * actual mechanism that keeps SUPABASE_SECRET_KEY/service-role keys out of the browser
 * bundle -- see docs/database.md and the report for this change for how
 * that was verified.
 *
 * scripts/embeddings/import.ts intentionally does not use this: it runs
 * with plain `node`, not through Next.js's bundler, and `server-only`
 * throws unconditionally outside that bundler. It builds its own admin
 * client from the same server-only environment contract.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const environment = serverEnv.supabaseAdmin;
  if (!environment) {
    throw configurationError(
      "SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required for admin access",
    );
  }
  return createClient(environment.url, environment.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
