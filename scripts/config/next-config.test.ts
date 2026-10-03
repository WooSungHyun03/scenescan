import { describe, expect, it } from "vitest";

import nextConfig, {
  buildContentSecurityPolicy,
  getSecurityHeaders,
} from "../../next.config";

describe("Next.js deployment security configuration", () => {
  it("keeps the standalone deployment boundary and removes framework disclosure", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sets the required production response headers", () => {
    const headers = new Map(
      getSecurityHeaders({ isDevelopment: false }).map(({ key, value }) => [
        key,
        value,
      ]),
    );

    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("allows HTTPS and local integration Supabase origins in the browser policy", () => {
    const httpsPolicy = buildContentSecurityPolicy({
      isDevelopment: false,
      supabaseUrl: "https://example.supabase.co/project-path",
    });
    const httpPolicy = buildContentSecurityPolicy({
      isDevelopment: false,
      supabaseUrl: "http://localhost:54321",
    });

    expect(httpsPolicy).toContain("https://example.supabase.co");
    expect(httpsPolicy).not.toContain("/project-path");
    expect(httpPolicy).toContain("http://localhost:54321");
    expect(httpsPolicy).not.toMatch(/script-src[^;]*blob:/);
    expect(httpsPolicy).toContain("worker-src 'self' blob:");
    expect(httpsPolicy).toContain("'wasm-unsafe-eval'");
    expect(httpsPolicy).toContain("https://cdn.jsdelivr.net");
    expect(httpsPolicy).toContain("https://huggingface.co");
    expect(httpsPolicy).toContain("https://dapi.kakao.com");
    expect(httpsPolicy).not.toContain("'unsafe-eval'");
  });

  it("adds the eval allowance only for the Next.js development runtime", () => {
    const developmentPolicy = buildContentSecurityPolicy({
      isDevelopment: true,
    });

    expect(developmentPolicy).toContain("'unsafe-eval'");
    expect(developmentPolicy).not.toContain("upgrade-insecure-requests");
  });
});
