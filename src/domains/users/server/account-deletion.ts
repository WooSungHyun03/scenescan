import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getVerifiedAuthUser } from "@/infrastructure/supabase/auth-verification";
import {
  ApplicationError,
  dataAccessError,
  forbiddenError,
  rateLimitedError,
  unauthenticatedError,
} from "@/shared/errors/application-error";

export type SupabaseAdminClientFactory = () => SupabaseClient;

/**
 * Deletes only the freshly verified session owner. No caller-provided user
 * id enters this boundary. Passwords are passed transiently to Supabase Auth
 * for reauthentication and are never logged or persisted by SceneScan.
 */
export async function deleteAuthenticatedAccount(
  authClient: SupabaseClient | null,
  getAdminClient: SupabaseAdminClientFactory,
  currentPassword: string,
): Promise<void> {
  const user = await getVerifiedAuthUser(authClient);
  if (!authClient || !user?.email) {
    throw unauthenticatedError("A fresh Supabase Auth user is required for account deletion");
  }

  let reauthentication;
  try {
    reauthentication = await authClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
  } catch (error) {
    throw dataAccessError("Account deletion reauthentication request failed", error);
  }

  if (reauthentication.error) {
    if (reauthentication.error.status === 429
      || reauthentication.error.code === "over_request_rate_limit") {
      throw rateLimitedError("Account deletion reauthentication was rate limited");
    }
    throw forbiddenError("Account deletion reauthentication failed");
  }
  if (reauthentication.data.user?.id !== user.id) {
    throw forbiddenError("Account deletion reauthentication identity mismatch");
  }

  const adminClient = getAdminClient();
  try {
    const { error } = await adminClient.auth.admin.deleteUser(user.id, false);
    if (error) throw dataAccessError("Supabase admin account deletion failed", error);
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw dataAccessError("Supabase admin account deletion request failed", error);
  }
}
