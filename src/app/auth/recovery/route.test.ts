import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/infrastructure/supabase/request-auth-client", () => ({
  createSupabaseRequestAuthClientFromCookies: createClient,
}));

import { GET } from "./route";

function authClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    },
  };
}

describe("GET /auth/recovery", () => {
  beforeEach(() => createClient.mockReset());

  it("keeps Docker recovery errors on the browser origin", async () => {
    const response = await GET(new NextRequest(
      "http://0.0.0.0:3000/auth/recovery?error_code=otp_expired",
      { headers: { "x-forwarded-host": "evil.example" } },
    ));
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/forgot-password?error=recovery_expired");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("exchanges a one-time PKCE code and removes it from the destination URL", async () => {
    const client = authClient();
    createClient.mockReturnValue(client);

    const response = await GET(new NextRequest(
      "https://scenescan.example/auth/recovery?code=one-time-secret&sb_flow_id=flow-a",
    ));

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time-secret", { flowId: "flow-a" });
    expect(response.headers.get("Location")).toBe("/recovery");
    expect(response.headers.get("Location")).not.toContain("one-time-secret");
    expect(response.headers.get("Cache-Control")).toContain("private");
  });

  it("accepts only recovery token hashes", async () => {
    const client = authClient();
    createClient.mockReturnValue(client);
    const success = await GET(new NextRequest(
      "https://scenescan.example/auth/recovery?token_hash=sensitive&type=recovery",
    ));
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "sensitive", type: "recovery" });
    expect(success.headers.get("Location")).toBe("/recovery");
    expect(success.headers.get("Location")).not.toContain("sensitive");

    const rejected = await GET(new NextRequest(
      "https://scenescan.example/auth/recovery?token_hash=wrong-purpose&type=signup",
    ));
    expect(rejected.headers.get("Location")).toBe(
      "/forgot-password?error=recovery_invalid",
    );
  });

  it("maps used or expired links without exposing provider details", async () => {
    createClient.mockReturnValue(authClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        error: { code: "flow_state_expired", message: "provider secret detail" },
      }),
    }));
    const response = await GET(new NextRequest(
      "https://scenescan.example/auth/recovery?code=used-secret",
    ));

    expect(response.headers.get("Location")).toBe(
      "/forgot-password?error=recovery_expired",
    );
    expect(response.headers.get("Location")).not.toContain("secret");
  });

  it("fails safely when auth is unavailable", async () => {
    createClient.mockReturnValue(null);
    const response = await GET(new NextRequest("https://scenescan.example/auth/recovery?code=x"));
    expect(response.headers.get("Location")).toBe(
      "/forgot-password?error=auth_unavailable",
    );
  });
});
