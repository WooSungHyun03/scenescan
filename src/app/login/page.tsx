import type { Metadata } from "next";

import { AuthForm, type AuthNotice } from "@/domains/users/components/auth-form";
import { getSafeAuthRedirect } from "@/domains/users/services/auth-redirect";

export const metadata: Metadata = { title: "로그인" };

const callbackMessages: Record<string, AuthNotice> = {
  auth_unavailable: {
    tone: "error",
    message: "인증 서비스가 아직 설정되지 않았습니다. 공개 장소 탐색은 계속 사용할 수 있습니다.",
  },
  callback_expired: {
    tone: "error",
    message: "인증 링크가 만료되었거나 이미 사용되었습니다. 로그인하거나 확인 메일을 다시 요청해 주세요.",
  },
  callback_invalid: {
    tone: "error",
    message: "인증 링크를 확인하지 못했습니다. 새 확인 메일로 다시 시도해 주세요.",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
    passwordChanged?: string | string[];
    sessionCleanup?: string | string[];
    accountDeleted?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const requestedNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const errorCode = Array.isArray(query.error) ? query.error[0] : query.error;
  const passwordChanged = (Array.isArray(query.passwordChanged) ? query.passwordChanged[0] : query.passwordChanged) === "1";
  const sessionCleanup = Array.isArray(query.sessionCleanup) ? query.sessionCleanup[0] : query.sessionCleanup;
  const accountDeleted = (Array.isArray(query.accountDeleted) ? query.accountDeleted[0] : query.accountDeleted) === "1";
  const next = getSafeAuthRedirect(requestedNext, "/account");
  const passwordNotice: AuthNotice | undefined = passwordChanged
    ? sessionCleanup === "partial"
      ? {
          tone: "error",
          message: "비밀번호는 변경되었고 이 브라우저는 로그아웃되었습니다. 다른 기기의 로그아웃 여부는 확인하지 못했으므로 계정 보안을 확인해 주세요.",
        }
      : {
          tone: "success",
          message: "비밀번호가 변경되어 모든 기기에서 로그아웃되었습니다. 새 비밀번호로 다시 로그인해 주세요.",
        }
    : undefined;
  const accountDeletedNotice: AuthNotice | undefined = accountDeleted
    ? { tone: "success", message: "회원탈퇴가 완료되어 이 브라우저의 계정 데이터와 세션을 정리했습니다." }
    : undefined;

  return (
    <main className="scene-container py-10 sm:py-16">
      <header className="mx-auto mb-7 max-w-md text-center">
        <p className="scene-kicker justify-center">Account</p>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">로그인</h1>
        <p className="mt-3 leading-relaxed text-muted">저장된 계정 세션을 확인하고 계정 설정으로 이동합니다.</p>
      </header>
      <AuthForm
        mode="login"
        next={next}
        initialNotice={accountDeletedNotice ?? passwordNotice ?? (errorCode ? callbackMessages[errorCode] : undefined)}
      />
    </main>
  );
}
