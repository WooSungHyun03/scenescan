import "server-only";
import { createClient } from "@supabase/supabase-js";
import { configurationError } from "@/shared/errors/application-error";

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw configurationError("Supabase URL and anon key are required in real mode");
  return createClient(url, anonKey, { auth: { persistSession: false } });
}
