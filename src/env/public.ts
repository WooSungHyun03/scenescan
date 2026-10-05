import { parsePublicEnvironment } from "./public-schema";

// Keep every access statically named so Next.js can inline only this public
// allow-list into Client Components. Never read process.env dynamically here.
export const publicEnv = parsePublicEnvironment({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_KAKAO_MAP_KEY: process.env.NEXT_PUBLIC_KAKAO_MAP_KEY,
  NEXT_PUBLIC_USE_MOCK_DATA: process.env.NEXT_PUBLIC_USE_MOCK_DATA,
  NEXT_PUBLIC_USE_MOCK_AI: process.env.NEXT_PUBLIC_USE_MOCK_AI,
  NEXT_PUBLIC_CLIP_DEVICE: process.env.NEXT_PUBLIC_CLIP_DEVICE,
});
