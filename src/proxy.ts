import type { NextRequest } from "next/server";
import { refreshSupabaseAuthSession } from "@/infrastructure/supabase/auth-proxy";

export async function proxy(request: NextRequest) {
  return refreshSupabaseAuthSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
