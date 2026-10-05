import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/domains/users/components/logout-button";
import { createSupabaseRequestAuthClient } from "@/infrastructure/supabase/request-auth-client";
import { getVerifiedAuthUser } from "@/infrastructure/supabase/auth-verification";
import { Button } from "@/shared/ui/button";

export const metadata: Metadata = { title: "계정 설정" };
export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string | string[] }>;
}) {
  const client = await createSupabaseRequestAuthClient();
  const user = await getVerifiedAuthUser(client);
  if (!user) redirect("/login?next=%2Faccount");

  const query = await searchParams;
  const confirmed = (Array.isArray(query.confirmed) ? query.confirmed[0] : query.confirmed) === "1";
  return (
    <main className="scene-container py-10 sm:py-16">
      <header className="scene-page-header">
        <p className="scene-kicker">Account settings</p>
        <h1 className="scene-page-title">계정 설정</h1>
        <p className="scene-page-description">현재 로그인 상태와 이메일 확인 정보를 관리합니다.</p>
      </header>

      <section className="scene-panel max-w-2xl p-5 sm:p-7" aria-labelledby="account-information-title">
        <h2 id="account-information-title" className="text-xl font-extrabold">계정 정보</h2>
        {confirmed && (
          <div className="scene-status mt-5" data-tone="success" role="status">
            이메일 확인이 완료되었습니다.
          </div>
        )}
        <dl className="mt-6 grid gap-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
          <dt className="scene-label">이메일</dt>
          <dd className="min-w-0 break-all font-semibold">{user.email ?? "정보 없음"}</dd>
          <dt className="scene-label">이메일 확인</dt>
          <dd className="font-semibold">{user.email_confirmed_at ? "확인됨" : "확인 필요"}</dd>
        </dl>
        <div className="mt-7 border-t border-line pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild><Link href="/account/security">계정 보안</Link></Button>
            <LogoutButton />
          </div>
        </div>
      </section>
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
        SceneScan은 별도 profiles 테이블을 만들지 않으며, 이 화면에는 Supabase Auth가 제공한 최소 계정 정보만 표시합니다.
      </p>
    </main>
  );
}
