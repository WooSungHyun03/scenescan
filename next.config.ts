import type { NextConfig } from "next";

function getSupabaseImagePattern(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!value) return [];

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return [];
    return [{
      protocol: "https",
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
  images: {
    remotePatterns: getSupabaseImagePattern(),
  },
};

export default nextConfig;
