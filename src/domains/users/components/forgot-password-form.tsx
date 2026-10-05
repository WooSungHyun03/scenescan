"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";

import { getSupabaseBrowserAuthClient } from "@/infrastructure/supabase/browser-auth-client";
import { Button } from "@/shared/ui/button";
import { getAuthInputError, forgotPasswordInputSchema } from "../services/auth-input";
import { buildPasswordRecoveryCallbackUrl } from "../services/auth-redirect";
import {
  getPasswordRecoveryWaitSeconds,
  PASSWORD_RECOVERY_STORAGE_KEY,
  recordPasswordRecoveryRequested,
} from "../services/recovery-cooldown";

type Notice = { tone: "error" | "progress" | "success"; message: string };
const subscribeToHydration = () => () => undefined;

export function ForgotPasswordForm({ initialNotice }: { initialNotice?: Notice }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [notice, setNotice] = useState<Notice | undefined>(initialNotice);

  useEffect(() => {
    const update = () => setWaitSeconds(getPasswordRecoveryWaitSeconds(window.localStorage));
    update();
    const interval = window.setInterval(update, 1_000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === PASSWORD_RECOVERY_STORAGE_KEY) update();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || waitSeconds > 0) return;

    const form = event.currentTarget;
    const parsed = forgotPasswordInputSchema.safeParse({
      email: String(new FormData(form).get("email") ?? ""),
    });
    if (!parsed.success) {
      setNotice({ tone: "error", message: getAuthInputError(parsed.error) });
      return;
    }

    const client = getSupabaseBrowserAuthClient();
    if (!client) {
      setNotice({
        tone: "error",
        message: "인증 서비스가 아직 설정되지 않았습니다. 공개 장소 탐색은 계속 사용할 수 있습니다.",
      });
      return;
    }

    setIsSubmitting(true);
    setNotice({ tone: "progress", message: "재설정 메일을 요청하고 있습니다." });
    recordPasswordRecoveryRequested(window.localStorage);
    setWaitSeconds(getPasswordRecoveryWaitSeconds(window.localStorage));
    try {
      const { error } = await client.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: buildPasswordRecoveryCallbackUrl(window.location.origin),
      });
      if (error?.status === 429 || error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
        setNotice({ tone: "error", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." });
        return;
      }
      if (error) {
        setNotice({
          tone: "error",
          message: "요청 완료 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }

      form.reset();
      setNotice({
        tone: "success",
        message: "가입된 계정이라면 비밀번호 재설정 메일을 보냈습니다. 받은 편지함과 스팸함을 확인해 주세요.",
      });
    } catch {
      setNotice({
        tone: "error",
        message: "요청 완료 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="scene-panel mx-auto w-full max-w-md p-5 sm:p-7">
      <form onSubmit={submit} noValidate aria-busy={isSubmitting}>
        <label htmlFor="forgot-password-email" className="scene-label">가입 이메일</label>
        <input
          id="forgot-password-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          className="scene-input mt-2"
        />
        {notice && (
          <div
            className="scene-status mt-5 text-sm leading-relaxed"
            data-tone={notice.tone}
            role={notice.tone === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {notice.message}
          </div>
        )}
        <Button type="submit" className="mt-6 w-full" disabled={!hydrated || isSubmitting || waitSeconds > 0}>
          {!hydrated
            ? "준비 중…"
            : isSubmitting
              ? "요청 중…"
              : waitSeconds > 0
                ? `${waitSeconds}초 후 다시 요청`
                : "재설정 메일 받기"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        비밀번호가 기억났나요? <Link href="/login" className="font-bold text-brand underline">로그인</Link>
      </p>
    </div>
  );
}
