import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { deleteAuthenticatedAccount } from "./account-deletion";

const userId = "11111111-1111-4111-8111-111111111111";

function authClient(options: {
  verifiedId?: string;
  reauthenticatedId?: string;
  signInError?: { code?: string; status?: number } | null;
} = {}): SupabaseClient {
  const verifiedId = options.verifiedId ?? userId;
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: verifiedId } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: verifiedId, email: "owner@example.test" } as User },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: options.signInError
            ? null
            : { id: options.reauthenticatedId ?? verifiedId } as User,
          session: null,
        },
        error: options.signInError ?? null,
      }),
    },
  } as unknown as SupabaseClient;
}

function adminClient(deleteError: unknown = null): SupabaseClient {
  return {
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ data: { user: null }, error: deleteError }),
      },
    },
  } as unknown as SupabaseClient;
}

describe("deleteAuthenticatedAccount", () => {
  it("reauthenticates the fresh user and passes only that verified id to admin deletion", async () => {
    const auth = authClient();
    const admin = adminClient();
    const getAdmin = vi.fn(() => admin);

    await expect(deleteAuthenticatedAccount(auth, getAdmin, "current-password"))
      .resolves.toBeUndefined();

    expect(auth.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.test",
      password: "current-password",
    });
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(userId, false);
    expect(getAdmin).toHaveBeenCalledOnce();
  });

  it("never deletes another id returned by a mismatched reauthentication", async () => {
    const admin = adminClient();
    await expect(deleteAuthenticatedAccount(
      authClient({ reauthenticatedId: "22222222-2222-4222-8222-222222222222" }),
      () => admin,
      "current-password",
    )).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("fails closed for an invalid password and maps provider throttling", async () => {
    const admin = adminClient();
    await expect(deleteAuthenticatedAccount(
      authClient({ signInError: { code: "invalid_credentials", status: 400 } }),
      () => admin,
      "wrong-password",
    )).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(deleteAuthenticatedAccount(
      authClient({ signInError: { code: "over_request_rate_limit", status: 429 } }),
      () => admin,
      "current-password",
    )).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("does not report success when admin deletion fails", async () => {
    const admin = adminClient({ message: "private provider detail" });
    await expect(deleteAuthenticatedAccount(authClient(), () => admin, "current-password"))
      .rejects.toMatchObject({ code: "DATA_UNAVAILABLE", status: 503 });
  });

  it("rejects a stale JWT when the latest user no longer exists", async () => {
    const getAdmin = vi.fn(() => adminClient());
    const staleClient = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: userId } }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { code: "user_not_found" } }),
        signInWithPassword: vi.fn(),
      },
    } as unknown as SupabaseClient;

    await expect(deleteAuthenticatedAccount(staleClient, getAdmin, "current-password"))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(staleClient.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(getAdmin).not.toHaveBeenCalled();
  });
});
