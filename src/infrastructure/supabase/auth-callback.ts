import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

export type AuthCallbackResult = {
  error: { code?: string; status?: number } | null;
};

/**
 * Completes a Supabase PKCE or token-hash callback. Callers decide which OTP
 * purposes are valid for their route so a recovery token cannot accidentally
 * enter the signup callback path.
 */
export async function completeSupabaseAuthCallback(
  client: SupabaseClient,
  searchParams: URLSearchParams,
  allowedOtpTypes: ReadonlySet<EmailOtpType>,
): Promise<AuthCallbackResult> {
  const code = searchParams.get("code");
  if (code) {
    const flowId = searchParams.get("sb_flow_id");
    const { error } = await client.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    return { error };
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && allowedOtpTypes.has(type)) {
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
    return { error };
  }

  return { error: { code: "callback_parameters_missing" } };
}
