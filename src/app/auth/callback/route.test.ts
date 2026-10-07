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

describe("GET /auth/callback", () => {
  beforeEach(() => {
    createClient.mockReset();
  });

  it("keeps Docker callbacks relative and ignores spoofed forwarded hosts", async () => {
    createClient.mockReturnValue(authClient());
    const response = await GET(new NextRequest(
      "http://0.0.0.0:3000/auth/callback?code=x&next=%2Fsearch",
      { headers: { host: "localhost:3000", "x-forwarded-host": "evil.example" } },
    ));
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/search");
  });

  it("exchanges a PKCE code, preserves Set-Cookie, and redirects internally", async () => {
    const client = authClient();
    createClient.mockImplementation((cookies) => {
      cookies.set("sb-project-auth-token", "verified", { httpOnly: true, path: "/" });
      return client;
    });

    const response = await GET(new NextRequest(
      "https://scenescan.example/auth/callback?code=one-time-code&sb_flow_id=flow-a&next=%2Fsearch",
    ));

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code", { flowId: "flow-a" });
    expect(response.headers.get("Location")).toBe("/search");
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("verified");
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });

  it("verifies the token-hash form used by SSR confirmation templates", async () => {
    const client = authClient();
    createClient.mockReturnValue(client);

    const response = await GET(new NextRequest(
      "https://scenescan.example/auth/callback?token_hash=hash&type=email",
    ));

    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash", type: "email" });
    expect(response.headers.get("Location")).toBe("/account?confirmed=1");
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal",
    "/auth/callback",
  ])("blocks open redirect destination %s", async (next) => {
    createClient.mockReturnValue(authClient());
    const url = new URL("https://scenescan.example/auth/callback");
    url.searchParams.set("code", "one-time-code");
    url.searchParams.set("next", next);

    const response = await GET(new NextRequest(url));

    expect(response.headers.get("Location")).toBe("/account?confirmed=1");
  });

  it("distinguishes an expired callback without exposing provider details", async () => {
    const client = authClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        error: { code: "flow_state_expired", message: "sensitive provider detail" },
      }),
    });
    createClient.mockReturnValue(client);

    const response = await GET(new NextRequest(
      "https://scenescan.example/auth/callback?code=expired&next=%2Faccount",
    ));

    expect(response.headers.get("Location")).toBe(
      "/login?error=callback_expired&next=%2Faccount",
    );
    expect(response.headers.get("Location")).not.toContain("sensitive");
  });

  it("fails safely when auth is unconfigured or callback parameters are invalid", async () => {
    createClient.mockReturnValueOnce(null);
    const unavailable = await GET(new NextRequest("https://scenescan.example/auth/callback?code=x"));
    expect(unavailable.headers.get("Location")).toContain("/login?error=auth_unavailable");

    createClient.mockReturnValueOnce(authClient());
    const invalid = await GET(new NextRequest("https://scenescan.example/auth/callback?next=%2Fsearch"));
    expect(invalid.headers.get("Location")).toContain("/login?error=callback_invalid");
  });

  it("does not accept recovery token hashes on the general callback", async () => {
    const client = authClient();
    createClient.mockReturnValue(client);
    const response = await GET(new NextRequest(
      "https://scenescan.example/auth/callback?token_hash=sensitive&type=recovery",
    ));

    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("Location")).toContain("/login?error=callback_invalid");
    expect(response.headers.get("Location")).not.toContain("sensitive");
  });
});
