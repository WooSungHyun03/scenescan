import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthErrorLike } from "./auth-error";

/** Provider configuration must not decide whether the current password is checked. */
export async function reauthenticatePassword(
  client: Pick<SupabaseClient, "auth">,
  password: string,
): Promise<AuthErrorLike | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return error ?? { code: "session_not_found" };

  const verifiedId = data.user.id;
  const result = await client.auth.signInWithPassword({ email: data.user.email, password });
  if (result.error) return result.error;
  if (result.data.user?.id !== verifiedId) return { code: "session_not_found" };
  return null;
}
