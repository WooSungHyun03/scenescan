import { describe, expect, it, vi } from "vitest";

import { createSupabaseRequestAuthClientFromCookies } from "./request-auth-client";

const config = {
  url: "https://project.supabase.co",
  publishableKey: "sb_publishable_test",
};

describe("request-scoped Supabase auth client", () => {
  it("stays disabled for keyless mock browsing", () => {
    const cookieStore = { getAll: vi.fn(() => []), set: vi.fn() };

    expect(createSupabaseRequestAuthClientFromCookies(cookieStore, null)).toBeNull();
    expect(cookieStore.getAll).not.toHaveBeenCalled();
  });

  it("creates a separate client for every request", () => {
    const first = createSupabaseRequestAuthClientFromCookies(
      { getAll: () => [{ name: "sb-project-auth-token", value: "a" }], set: vi.fn() },
      config,
    );
    const second = createSupabaseRequestAuthClientFromCookies(
      { getAll: () => [{ name: "sb-project-auth-token", value: "b" }], set: vi.fn() },
      config,
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
  });
});
