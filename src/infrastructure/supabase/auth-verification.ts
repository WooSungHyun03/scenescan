import "server-only";

import type { JwtPayload, SupabaseClient, User } from "@supabase/supabase-js";
import { unauthenticatedError } from "@/shared/errors/application-error";

/** Never derives identity from getSession() or directly decoded cookie data. */
export async function getVerifiedAuthClaims(
  client: SupabaseClient | null,
): Promise<JwtPayload | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return data.claims;
  } catch {
    return null;
  }
}

/** Use only when the latest Auth user record is actually required. */
export async function getVerifiedAuthUser(
  client: SupabaseClient | null,
): Promise<User | null> {
  const claims = await getVerifiedAuthClaims(client);
  if (!client || !claims?.sub) return null;

  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || data.user.id !== claims.sub) return null;
    return data.user;
  } catch {
    return null;
  }
}

export async function requireVerifiedAuthClaims(
  client: SupabaseClient | null,
): Promise<JwtPayload> {
  const claims = await getVerifiedAuthClaims(client);
  if (!claims) throw unauthenticatedError("Verified Supabase claims are required");
  return claims;
}
