import { afterEach, describe, expect, it, vi } from "vitest";

describe("browser Supabase auth client", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@supabase/ssr");
    vi.doUnmock("./auth-config");
  });

  it("stays disabled in keyless mock mode", async () => {
    const createBrowserClient = vi.fn();
    vi.doMock("@supabase/ssr", () => ({ createBrowserClient }));
    vi.doMock("./auth-config", () => ({
      getSupabasePublicAuthConfig: () => null,
    }));

    const { getSupabaseBrowserAuthClient } = await import("./browser-auth-client");

    expect(getSupabaseBrowserAuthClient()).toBeNull();
    expect(createBrowserClient).not.toHaveBeenCalled();
  });

  it("uses one PKCE client per tab module and only public configuration", async () => {
    const fakeClient = { auth: {} };
    const createBrowserClient = vi.fn(() => fakeClient);
    vi.doMock("@supabase/ssr", () => ({ createBrowserClient }));
    vi.doMock("./auth-config", () => ({
      getSupabasePublicAuthConfig: () => ({
        url: "https://project.supabase.co",
        publishableKey: "sb_publishable_public",
      }),
    }));

    const { getSupabaseBrowserAuthClient } = await import("./browser-auth-client");
    const first = getSupabaseBrowserAuthClient();
    const second = getSupabaseBrowserAuthClient();

    expect(first).toBe(fakeClient);
    expect(second).toBe(fakeClient);
    expect(createBrowserClient).toHaveBeenCalledOnce();
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_publishable_public",
      expect.objectContaining({
        isSingleton: true,
        auth: expect.objectContaining({ flowType: "pkce", persistSession: true }),
      }),
    );
  });
});
