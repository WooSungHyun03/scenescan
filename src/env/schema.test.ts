import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertNoPublicSupabaseSecrets,
  parsePublicEnvironment,
  parseServerEnvironment,
} from "./schema";

describe("environment contracts", () => {
  it("keeps .env.example aligned with the validated application contract", () => {
    const example = Object.fromEntries(
      readFileSync(resolve(process.cwd(), ".env.example"), "utf8")
        .split(/\r?\n/u)
        .filter((line) => /^[A-Z][A-Z0-9_]*=/u.test(line))
        .map((line) => line.split("=", 2) as [string, string]),
    );

    expect(Object.keys(example).sort()).toEqual([
      "NEXT_PUBLIC_CLIP_DEVICE",
      "NEXT_PUBLIC_KAKAO_MAP_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_USE_MOCK_AI",
      "NEXT_PUBLIC_USE_MOCK_DATA",
      "PUBLIC_DATA_PORTAL_SERVICE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ]);
    expect(() => parsePublicEnvironment(example)).not.toThrow();
    expect(() => parseServerEnvironment(example)).not.toThrow();
  });

  it("defaults to keyless mock mode with the WASM CLIP device", () => {
    expect(parsePublicEnvironment({})).toEqual({
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      kakaoMapKey: undefined,
      useMockData: true,
      useMockAi: true,
      clipDevice: "wasm",
    });
  });

  it("requires the public Supabase pair in real data mode", () => {
    expect(() => parsePublicEnvironment({
      NEXT_PUBLIC_USE_MOCK_DATA: "false",
    })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => parsePublicEnvironment({
      NEXT_PUBLIC_USE_MOCK_DATA: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    })).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("accepts HTTPS services and localhost integration URLs", () => {
    expect(parsePublicEnvironment({
      NEXT_PUBLIC_USE_MOCK_DATA: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      NEXT_PUBLIC_CLIP_DEVICE: "webgpu",
    })).toMatchObject({ useMockData: false, clipDevice: "webgpu" });

    expect(parsePublicEnvironment({
      NEXT_PUBLIC_USE_MOCK_DATA: "false",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
    }).supabaseUrl).toBe("http://127.0.0.1:54321");
  });

  it("rejects invalid modes, devices, and non-local insecure URLs", () => {
    expect(() => parsePublicEnvironment({
      NEXT_PUBLIC_USE_MOCK_AI: "1",
    })).toThrow(/NEXT_PUBLIC_USE_MOCK_AI/);
    expect(() => parsePublicEnvironment({
      NEXT_PUBLIC_CLIP_DEVICE: "cpu",
    })).toThrow(/NEXT_PUBLIC_CLIP_DEVICE/);
    expect(() => parsePublicEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "http://project.supabase.co",
    })).toThrow(/HTTPS/);
  });

  it("rejects every populated NEXT_PUBLIC secret or service-role variable", () => {
    expect(() => assertNoPublicSupabaseSecrets({
      NEXT_PUBLIC_SUPABASE_SECRET_KEY: "must-not-ship",
    })).toThrow(/NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
    expect(() => parseServerEnvironment({
      NEXT_PUBLIC_CUSTOM_SUPABASE_SERVICE_ROLE_TOKEN: "must-not-ship",
    })).toThrow(/NEXT_PUBLIC_CUSTOM_SUPABASE_SERVICE_ROLE_TOKEN/);
  });

  it("validates the optional server pair and prefers the current secret key", () => {
    expect(parseServerEnvironment({})).toEqual({});
    expect(() => parseServerEnvironment({
      SUPABASE_URL: "https://project.supabase.co",
    })).toThrow(/SUPABASE_SECRET_KEY/);
    expect(() => parseServerEnvironment({
      SUPABASE_SECRET_KEY: "secret",
    })).toThrow(/SUPABASE_URL/);

    expect(parseServerEnvironment({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: "preferred",
      SUPABASE_SERVICE_ROLE_KEY: "legacy",
    })).toEqual({
      supabaseAdmin: {
        url: "https://project.supabase.co",
        secretKey: "preferred",
      },
    });
  });

  it("keeps the public data collection key server-only", () => {
    expect(parseServerEnvironment({ PUBLIC_DATA_PORTAL_SERVICE_KEY: "collection-secret" }))
      .toEqual({ publicDataPortalServiceKey: "collection-secret" });
    expect(parsePublicEnvironment({ PUBLIC_DATA_PORTAL_SERVICE_KEY: "collection-secret" }))
      .not.toHaveProperty("publicDataPortalServiceKey");
  });
});
