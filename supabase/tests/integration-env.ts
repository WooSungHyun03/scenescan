/**
 * Shared by every *.integration.test.ts file. Requires the exact same env
 * var names the app itself uses (see .env.example) -- no separate
 * integration-only naming, and no hardcoded fallback: if any are missing,
 * `getIntegrationEnv()` returns null and the caller is expected to skip
 * (see `describe.skipIf(!env)` in every integration test file), so
 * `pnpm test:integration` run without a live Supabase instance skips
 * cleanly instead of failing on a connection error.
 *
 * `.env.integration.example` documents the exact values `supabase start`
 * prints for a freshly-`supabase init`-ed project (see
 * docs/integration-testing.md) -- copy them into your shell before running.
 */
export type IntegrationEnv = {
  url: string;
  anonKey: string;
  serviceRoleUrl: string;
  serviceRoleKey: string;
};

export function getIntegrationEnv(): IntegrationEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleUrl || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleUrl, serviceRoleKey };
}
