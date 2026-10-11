import type { Metadata } from "next";

import { AuthForm } from "@/domains/users/components/auth-form";
import { getSafeAuthRedirect } from "@/domains/users/services/auth-redirect";

export const metadata: Metadata = { title: "회원가입" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const next = getSafeAuthRedirect(requestedNext, "/account?confirmed=1");

  return (
    <main className="scene-container py-10 sm:py-16">
      <header className="mx-auto mb-7 max-w-md text-center">
        <p className="scene-kicker justify-center">Join SceneScan</p>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">회원가입</h1>
        <p className="mt-3 leading-relaxed text-muted">
          가입 후 이메일로 받은 확인 링크를 열면 로그인할 수 있습니다.
        </p>
      </header>
      <AuthForm mode="signup" next={next} />
    </main>
  );
}
