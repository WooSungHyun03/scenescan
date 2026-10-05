import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PasswordUpdateForm } from "@/domains/users/components/password-update-form";
import { getVerifiedAuthUser } from "@/infrastructure/supabase/auth-verification";
import { createSupabaseRequestAuthClient } from "@/infrastructure/supabase/request-auth-client";

export const metadata: Metadata = { title: "새 비밀번호 설정" };
export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  const client = await createSupabaseRequestAuthClient();
  const user = await getVerifiedAuthUser(client);
  if (!user) redirect("/forgot-password?error=recovery_expired");

  return (
    <main className="scene-container py-10 sm:py-16">
      <header className="mx-auto mb-7 max-w-2xl text-center">
        <p className="scene-kicker justify-center">Secure recovery</p>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">새 비밀번호 설정</h1>
        <p className="mt-3 leading-relaxed text-muted">
          재설정 링크 확인이 완료되었습니다. 새 비밀번호는 Supabase Auth에만 전달됩니다.
        </p>
      </header>
      <section className="scene-panel mx-auto max-w-2xl p-5 sm:p-7" aria-labelledby="recovery-form-title">
        <h2 id="recovery-form-title" className="text-xl font-extrabold">비밀번호 변경</h2>
        <div className="mt-6"><PasswordUpdateForm mode="recovery" /></div>
      </section>
    </main>
  );
}
