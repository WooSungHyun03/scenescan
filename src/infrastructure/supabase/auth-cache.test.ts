import { describe, expect, it } from "vitest";

import { isSupabaseAuthCookie } from "./auth-cache";

describe("Supabase auth cookie detection", () => {
  it.each([
    "sb-project-auth-token",
    "sb-project-auth-token.0",
    "sb-localhost-auth-token-code-verifier",
  ])("recognizes %s", (name) => {
    expect(isSupabaseAuthCookie(name)).toBe(true);
  });

  it.each(["theme", "sb-project-preferences", "other-auth-token"])(
    "does not classify %s as an auth cookie",
    (name) => {
      expect(isSupabaseAuthCookie(name)).toBe(false);
    },
  );
});
