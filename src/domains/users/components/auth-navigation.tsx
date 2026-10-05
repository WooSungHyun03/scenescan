"use client";

import { LogIn, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getSupabaseBrowserAuthClient } from "@/infrastructure/supabase/browser-auth-client";

export function AuthNavigation() {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserAuthClient();
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({ data, error }) => {
      if (active) setAuthenticated(!error && Boolean(data.user));
    }).catch(() => {
      if (active) setAuthenticated(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      // Client session state is used only for navigation presentation. Every
      // protected server operation independently verifies claims/user data.
      if (active) setAuthenticated(Boolean(session?.user));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const href = authenticated ? "/account" : "/login";
  const label = authenticated ? "계정" : "로그인";
  const Icon = authenticated ? UserRound : LogIn;
  return (
    <Link
      href={href}
      className="scene-nav-link"
      aria-current={pathname === href ? "page" : undefined}
      aria-label={label}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
