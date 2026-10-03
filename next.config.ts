import type { NextConfig } from "next";
import {
  assertNoPublicSupabaseSecrets,
  parsePublicEnvironment,
  parseServerEnvironment,
} from "./src/env/schema";

assertNoPublicSupabaseSecrets(process.env);
const buildPublicEnvironment = parsePublicEnvironment(process.env);
parseServerEnvironment(process.env);

type SecurityHeader = {
  key: string;
  value: string;
};

type ContentSecurityPolicyOptions = {
  isDevelopment?: boolean;
  supabaseUrl?: string;
};

function getCspOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value);
    const isLocalHttp = url.protocol === "http:"
      && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    return url.protocol === "https:" || isLocalHttp ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Keep browser capabilities explicit. The two unsafe allowances are narrowly
 * scoped to what the current UI needs: inline styles/scripts emitted by Next
 * and Kakao, and WebAssembly compilation used by Transformers.js.
 */
export function buildContentSecurityPolicy({
  isDevelopment = process.env.NODE_ENV !== "production",
  supabaseUrl = buildPublicEnvironment.supabaseUrl,
}: ContentSecurityPolicyOptions = {}): string {
  const supabaseOrigin = getCspOrigin(supabaseUrl);
  const kakaoSources = [
    "https://dapi.kakao.com",
    "https://*.kakao.com",
    "https://*.kakaocdn.net",
    "https://*.daumcdn.net",
  ];
  const modelSources = [
    "https://huggingface.co",
    "https://*.huggingface.co",
    "https://*.hf.co",
  ];
  const wasmSources = ["https://cdn.jsdelivr.net"];

  const directives = [
    "default-src 'self'",
    [
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      isDevelopment ? "'unsafe-eval'" : null,
      ...kakaoSources,
      ...wasmSources,
    ].filter(Boolean).join(" "),
    "style-src 'self' 'unsafe-inline'",
    [
      "img-src 'self' data: blob:",
      supabaseOrigin,
      ...kakaoSources,
    ].filter(Boolean).join(" "),
    [
      "connect-src 'self'",
      supabaseOrigin,
      ...modelSources,
      ...wasmSources,
      ...kakaoSources,
    ].filter(Boolean).join(" "),
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ];

  return directives.join("; ");
}

export function getSecurityHeaders(
  options: ContentSecurityPolicyOptions = {},
): SecurityHeader[] {
  const isDevelopment = options.isDevelopment
    ?? process.env.NODE_ENV !== "production";

  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy({ ...options, isDevelopment }),
    },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    ...(
      isDevelopment
        ? []
        : [{
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          }]
    ),
  ];
}

function getSupabaseImagePattern(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const value = buildPublicEnvironment.supabaseUrl;
  if (!value) return [];

  try {
    const url = new URL(value);
    const isLocalHttp = url.protocol === "http:"
      && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !isLocalHttp) return [];
    return [{
      protocol: url.protocol === "https:" ? "https" : "http",
      hostname: url.hostname,
      port: url.port,
      pathname: "/storage/v1/object/public/location-images/**",
    }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: getSupabaseImagePattern(),
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: getSecurityHeaders(),
    }];
  },
};

export default nextConfig;
