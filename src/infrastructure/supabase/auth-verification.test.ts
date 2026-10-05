import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  getVerifiedAuthClaims,
  getVerifiedAuthUser,
  requireVerifiedAuthClaims,
} from "./auth-verification";

function clientWithAuth(auth: Record<string, unknown>): SupabaseClient {
  return { auth } as unknown as SupabaseClient;
}

describe("server-side auth verification", () => {
  it("fails closed for missing, expired, and forged claims", async () => {
    await expect(getVerifiedAuthClaims(null)).resolves.toBeNull();
    await expect(getVerifiedAuthClaims(clientWithAuth({
      getClaims: vi.fn().mockResolvedValue({ data: null, error: new Error("expired") }),
    }))).resolves.toBeNull();
    await expect(getVerifiedAuthClaims(clientWithAuth({
      getClaims: vi.fn().mockRejectedValue(new Error("invalid signature")),
    }))).resolves.toBeNull();
  });

  it("returns only cryptographically verified claims with a subject", async () => {
    const claims = { sub: "user-a", role: "authenticated" };
    const client = clientWithAuth({
      getClaims: vi.fn().mockResolvedValue({ data: { claims }, error: null }),
    });

    await expect(getVerifiedAuthClaims(client)).resolves.toMatchObject(claims);
  });

  it("calls getUser only after claims verification and rejects an identity mismatch", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-b" } as User },
      error: null,
    });
    const client = clientWithAuth({
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: "user-a" } },
        error: null,
      }),
      getUser,
    });

    await expect(getVerifiedAuthUser(client)).resolves.toBeNull();
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("does not call getUser when claims verification fails", async () => {
    const getUser = vi.fn();
    const client = clientWithAuth({
      getClaims: vi.fn().mockResolvedValue({ data: null, error: new Error("forged") }),
      getUser,
    });

    await expect(getVerifiedAuthUser(client)).resolves.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("raises the shared 401 contract when verified claims are required", async () => {
    const client = clientWithAuth({
      getClaims: vi.fn().mockResolvedValue({ data: null, error: new Error("expired") }),
    });

    await expect(requireVerifiedAuthClaims(client)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });
});
