import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client factory for plain-Node scripts (run outside
 * Next.js -- scripts/data/import.ts is the second consumer after
 * scripts/embeddings/import.ts). Deliberately does NOT `import "server-only"`:
 * that package's main export throws unconditionally under plain Node
 * execution (verified in an earlier session -- its package.json only maps
 * to a no-op module via a "react-server" export condition that Next.js's
 * bundler applies and plain `node` does not), so it would break every
 * script that imports this module, not just accidental client-bundle use.
 * `src/infrastructure/supabase/admin-client.ts` is the Next.js-side
 * equivalent and keeps its `server-only` guard -- these are separate
 * modules for separate runtimes, not a duplicate to consolidate.
 *
 * scripts/embeddings/import.ts (Member 1's file) implements this same
 * env-reading/client-creation logic inline today rather than importing this
 * module; not changed here (out of scope, cross-owner file) -- see the
 * report for this change for the proposed diff to adopt it there too.
 */
export type SupabaseAdminEnvironment = { url: string; serviceRoleKey: string };

export function readSupabaseAdminEnvironment(env: Readonly<Record<string, string | undefined>>): SupabaseAdminEnvironment {
  // SUPABASE_SECRET_KEY is Supabase's current API key name; SUPABASE_SERVICE_ROLE_KEY
  // is accepted as a legacy fallback (SECRET_KEY wins if both are set) --
  // matches scripts/embeddings/import.ts's readDatabaseEnvironment
  // (Member 1's file, not duplicated here, but kept in sync by convention).
  if (env.NEXT_PUBLIC_SUPABASE_SECRET_KEY || env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Service role credentials must never use a NEXT_PUBLIC_ environment variable");
  }
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required for this operation");
  }
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
    throw new Error("SUPABASE_URL must use HTTPS unless it targets localhost");
  }
  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient(environment: SupabaseAdminEnvironment): SupabaseClient {
  return createClient(environment.url, environment.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
