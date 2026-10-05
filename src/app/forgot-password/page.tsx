import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/domains/users/components/forgot-password-form";

export const metadata: Metadata = { title: "비밀번호 찾기" };

const recoveryMessages = {
  auth_unavailable: {
    tone: "error" as const,
    message: "인증 서비스가 아직 설정되지 않았습니다. 공개 장소 탐색은 계속 사용할 수 있습니다.",
  },
  recovery_expired: {
    tone: "error" as const,
    message: "재설정 링크가 만료되었거나 이미 사용되었습니다. 새 메일을 요청해 주세요.",
  },
  recovery_invalid: {
    tone: "error" as const,
    message: "재설정 링크를 확인하지 못했습니다. 새 메일을 요청해 주세요.",
  },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const initialNotice = error && error in recoveryMessages
    ? recoveryMessages[error as keyof typeof recoveryMessages]
    : undefined;

  return (
    <main className="scene-container py-10 sm:py-16">
      <header className="mx-auto mb-7 max-w-md text-center">
        <p className="scene-kicker justify-center">Account recovery</p>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">비밀번호 찾기</h1>
        <p className="mt-3 leading-relaxed text-muted">
          계정 가입 여부와 관계없이 같은 안내를 표시해 개인정보를 보호합니다.
        </p>
      </header>
      <ForgotPasswordForm initialNotice={initialNotice} />
    </main>
  );
}
