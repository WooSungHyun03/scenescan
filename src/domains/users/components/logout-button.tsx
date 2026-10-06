"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SHORTLIST_AUTH_RESET_EVENT } from "@/domains/locations/components/shortlist-storage";
import { getSupabaseBrowserAuthClient } from "@/infrastructure/supabase/browser-auth-client";
import { Button } from "@/shared/ui/button";
import { getAuthErrorMessage } from "../services/auth-error";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    const client = getSupabaseBrowserAuthClient();
    if (!client) {
      setError("인증 서비스가 설정되지 않았습니다.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { error: signOutError } = await client.auth.signOut({ scope: "local" });
      if (signOutError) {
        setError(getAuthErrorMessage(signOutError));
        return;
      }
      window.dispatchEvent(new Event(SHORTLIST_AUTH_RESET_EVENT));
      router.replace("/");
      router.refresh();
    } catch {
      setError(getAuthErrorMessage(null));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="outline" disabled={pending} onClick={logout}>
        {pending ? "로그아웃 중…" : "로그아웃"}
      </Button>
      {error && <p className="mt-3 text-sm text-[var(--destructive)]" role="alert">{error}</p>}
    </div>
  );
}
