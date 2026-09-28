import { describe, expect, it } from "vitest";
import { readSupabaseAdminEnvironment } from "./supabase-admin-client.ts";

describe("readSupabaseAdminEnvironment", () => {
  it("rejects a service role key placed in a NEXT_PUBLIC_ variable, even if SUPABASE_SERVICE_ROLE_KEY is also set correctly", () => {
    expect(() => readSupabaseAdminEnvironment({
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "leaked",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    })).toThrow(/NEXT_PUBLIC_/);
  });

  it("requires both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", () => {
    expect(() => readSupabaseAdminEnvironment({})).toThrow();
    expect(() => readSupabaseAdminEnvironment({ SUPABASE_URL: "https://project.supabase.co" })).toThrow();
    expect(() => readSupabaseAdminEnvironment({ SUPABASE_SERVICE_ROLE_KEY: "secret" })).toThrow();
  });

  it("requires HTTPS unless the host is localhost/127.0.0.1", () => {
    expect(() => readSupabaseAdminEnvironment({
      SUPABASE_URL: "http://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    })).toThrow(/HTTPS/);
    expect(readSupabaseAdminEnvironment({
      SUPABASE_URL: "http://localhost:54321",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    })).toEqual({ url: "http://localhost:54321", serviceRoleKey: "secret" });
    expect(readSupabaseAdminEnvironment({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    }).url).toBe("http://127.0.0.1:54321");
  });

  it("accepts a well-formed HTTPS project URL and trims whitespace", () => {
    expect(readSupabaseAdminEnvironment({
      SUPABASE_URL: "  https://project.supabase.co  ",
      SUPABASE_SERVICE_ROLE_KEY: "  secret  ",
    })).toEqual({ url: "https://project.supabase.co", serviceRoleKey: "secret" });
  });
});
