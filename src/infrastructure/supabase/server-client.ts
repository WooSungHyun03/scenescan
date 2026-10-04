import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/env/public";
import { configurationError } from "@/shared/errors/application-error";

// Anon-key, RLS-scoped client for read paths (repositories). For privileged
// service-role access use ./admin-client instead -- never widen this
// function to accept a service role key.
export function getSupabaseClient() {
  const url = publicEnv.supabaseUrl;
  const anonKey = publicEnv.supabaseAnonKey;
  if (!url || !anonKey) throw configurationError("Supabase URL and anon key are required in real mode");
  return createClient(url, anonKey, {
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
