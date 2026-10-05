import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { PRIVATE_CACHE_CONTROL } from "@/shared/http/private-cache";
import {
  refreshSupabaseAuthSession,
  type ProxyAuthClientFactory,
} from "./auth-proxy";
import type { SupabasePublicAuthConfig } from "./auth-config";

const config: SupabasePublicAuthConfig = {
  url: "https://project.supabase.co",
  publishableKey: "sb_publishable_test",
};

function request(cookie?: string): NextRequest {
  return new NextRequest("https://scenescan.example/search", {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("Supabase auth proxy", () => {
  it("leaves keyless mock browsing public and does not construct an auth client", async () => {
    const createClient = vi.fn();
    const response = await refreshSupabaseAuthSession(request(), {
      config: null,
      createClient,
    });

    expect(createClient).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("persists a refreshed expired session and prevents shared caching", async () => {
    const createClient: ProxyAuthClientFactory = (cookies) => ({
      auth: {
        async getClaims() {
          expect(cookies.getAll()).toContainEqual({
            name: "sb-project-auth-token",
            value: "expired-token",
          });
          cookies.setAll(
            [{
              name: "sb-project-auth-token",
              value: "fresh-token",
              options: { httpOnly: true, path: "/", sameSite: "lax" },
            }],
            { "Cache-Control": PRIVATE_CACHE_CONTROL },
          );
          return { data: { claims: { sub: "user-a" } }, error: null };
        },
      },
    });

    const response = await refreshSupabaseAuthSession(
      request("sb-project-auth-token=expired-token"),
      { config, createClient },
    );

    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("fresh-token");
    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
    expect(response.headers.get("Vary")).toContain("Cookie");
  });

  it("never grants identity to a forged cookie and still isolates the response cache", async () => {
    const createClient: ProxyAuthClientFactory = () => ({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("invalid JWT signature"),
        }),
      },
    });

    const response = await refreshSupabaseAuthSession(
      request("sb-project-auth-token=forged"),
      { config, createClient },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
    expect(response.headers.get("Vary")).toContain("Cookie");
  });

  it("keeps simultaneous tab requests request-scoped", async () => {
    const observedTokens: string[] = [];
    const createClient: ProxyAuthClientFactory = (cookies) => ({
      auth: {
        async getClaims() {
          const token = cookies.getAll()
            .find(({ name }) => name === "sb-project-auth-token")?.value ?? "missing";
          observedTokens.push(token);
          cookies.setAll(
            [{
              name: "sb-project-auth-token",
              value: `${token}-refreshed`,
              options: { path: "/" },
            }],
            { "Cache-Control": PRIVATE_CACHE_CONTROL },
          );
          return { data: { claims: { sub: token } }, error: null };
        },
      },
    });

    const [first, second] = await Promise.all([
      refreshSupabaseAuthSession(request("sb-project-auth-token=tab-a"), { config, createClient }),
      refreshSupabaseAuthSession(request("sb-project-auth-token=tab-b"), { config, createClient }),
    ]);

    expect(observedTokens).toEqual(expect.arrayContaining(["tab-a", "tab-b"]));
    expect(first.cookies.get("sb-project-auth-token")?.value).toBe("tab-a-refreshed");
    expect(second.cookies.get("sb-project-auth-token")?.value).toBe("tab-b-refreshed");
  });
});
