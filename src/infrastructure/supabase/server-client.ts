import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/env/public";
import { configurationError } from "@/shared/errors/application-error";

// Stateless publishable-key, RLS-scoped client for public read paths
// (repositories). The legacy anon key resolves through the same public env
// slot during migration. For cookie-backed user sessions use the dedicated
// browser/request auth clients. For privileged
// service-role access use ./admin-client instead -- never widen this
// function to accept a service role key.
export function getSupabaseClient() {
  const url = publicEnv.supabaseUrl;
  const publishableKey = publicEnv.supabasePublishableKey;
  if (!url || !publishableKey) throw configurationError("Supabase URL and publishable key are required in real mode");
  return createClient(url, publishableKey, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
      }),
    },
  });
}
