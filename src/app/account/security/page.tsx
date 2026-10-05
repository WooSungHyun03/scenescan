import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordUpdateForm } from "@/domains/users/components/password-update-form";
import { AccountDeletionForm } from "@/domains/users/components/account-deletion-form";
import { getVerifiedAuthUser } from "@/infrastructure/supabase/auth-verification";
import { createSupabaseRequestAuthClient } from "@/infrastructure/supabase/request-auth-client";

export const metadata: Metadata = { title: "계정 보안" };
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const client = await createSupabaseRequestAuthClient();
  const user = await getVerifiedAuthUser(client);
  if (!user) redirect("/login?next=%2Faccount%2Fsecurity");

  return (
    <main className="scene-container py-10 sm:py-16">
      <header className="scene-page-header max-w-2xl">
        <p className="scene-kicker">Account security</p>
        <h1 className="scene-page-title">계정 보안</h1>
        <p className="scene-page-description">
          현재 비밀번호로 본인임을 다시 확인한 뒤 새 비밀번호를 설정합니다.
        </p>
      </header>
      <section className="scene-panel max-w-2xl p-5 sm:p-7" aria-labelledby="password-change-title">
        <h2 id="password-change-title" className="text-xl font-extrabold">비밀번호 변경</h2>
        <div className="mt-6"><PasswordUpdateForm mode="account" /></div>
      </section>
      <section
        className="scene-panel mt-8 max-w-2xl border-[var(--destructive)] p-5 sm:p-7"
        aria-labelledby="account-deletion-title"
      >
        <p className="scene-kicker text-[var(--destructive)]">Danger zone</p>
        <h2 id="account-deletion-title" className="mt-3 text-xl font-extrabold">회원탈퇴</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          계정과 계정에 귀속된 데이터는 복구할 수 없습니다. 공용 장소·이미지 데이터는 삭제되지 않으며,
          이 브라우저에 저장된 관심 장소와 인증 관련 캐시는 함께 정리됩니다.
        </p>
        <div className="mt-6"><AccountDeletionForm /></div>
      </section>
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
        변경이 완료되면 모든 기기의 갱신 세션을 종료하고 로그인 화면으로 이동합니다. 현재 화면으로 돌아가려면{" "}
        <Link href="/account" className="font-bold text-brand underline">계정 설정</Link>을 선택하세요.
      </p>
    </main>
  );
}
