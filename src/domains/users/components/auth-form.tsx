"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserAuthClient } from "@/infrastructure/supabase/browser-auth-client";
import { Button } from "@/shared/ui/button";
import { buildAuthCallbackUrl } from "../services/auth-redirect";
import { getAuthErrorMessage, isEmailNotConfirmed } from "../services/auth-error";
import { getAuthInputError, loginInputSchema, signupInputSchema } from "../services/auth-input";
import {
  AUTH_RESEND_STORAGE_KEY,
  getConfirmationResendWaitSeconds,
  recordConfirmationEmailSent,
} from "../services/resend-cooldown";

export type AuthNotice = { tone: "error" | "progress" | "success"; message: string };

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function clearPasswordFields(form: HTMLFormElement): void {
  for (const name of ["password", "passwordConfirmation"]) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement) field.value = "";
  }
}

export function AuthForm({
  mode,
  next,
  initialNotice,
}: {
  mode: "login" | "signup";
  next: string;
  initialNotice?: AuthNotice;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [notice, setNotice] = useState<AuthNotice | undefined>(initialNotice);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendWait, setResendWait] = useState(0);
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const update = () => setResendWait(getConfirmationResendWaitSeconds(window.localStorage));
    update();
    const interval = window.setInterval(update, 1_000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_RESEND_STORAGE_KEY) update();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const values = new FormData(form);
    const input = {
      email: String(values.get("email") ?? ""),
      password: String(values.get("password") ?? ""),
      ...(mode === "signup"
        ? { passwordConfirmation: String(values.get("passwordConfirmation") ?? "") }
        : {}),
    };
    const parsed = mode === "signup"
      ? signupInputSchema.safeParse(input)
      : loginInputSchema.safeParse(input);
    if (!parsed.success) {
      clearPasswordFields(form);
      setNotice({ tone: "error", message: getAuthInputError(parsed.error) });
      return;
    }

    const client = getSupabaseBrowserAuthClient();
    if (!client) {
      clearPasswordFields(form);
      setNotice({
        tone: "error",
        message: "인증 서비스가 아직 설정되지 않았습니다. 공개 장소 탐색은 계속 사용할 수 있습니다.",
      });
      return;
    }

    setIsSubmitting(true);
    setNotice({ tone: "progress", message: mode === "signup" ? "가입 요청을 보내고 있습니다." : "로그인하고 있습니다." });
    const email = parsed.data.email;
    const password = parsed.data.password;

    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: buildAuthCallbackUrl(window.location.origin, next) },
        });
        clearPasswordFields(form);
        if (error) {
          setNotice({ tone: "error", message: getAuthErrorMessage(error) });
          return;
        }
        if (data.session) {
          router.replace(next);
          router.refresh();
          return;
        }

        setPendingEmail(email);
        recordConfirmationEmailSent(window.localStorage);
        setResendWait(getConfirmationResendWaitSeconds(window.localStorage));
        setNotice({
          tone: "success",
          message: "확인 메일을 보냈습니다. 메일의 링크를 열어 가입을 완료해 주세요.",
        });
        return;
      }

      const { error } = await client.auth.signInWithPassword({ email, password });
      clearPasswordFields(form);
      if (error) {
        if (isEmailNotConfirmed(error)) setPendingEmail(email);
        setNotice({ tone: "error", message: getAuthErrorMessage(error) });
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      clearPasswordFields(form);
      setNotice({ tone: "error", message: getAuthErrorMessage(null) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendConfirmation() {
    if (!pendingEmail || isResending || resendWait > 0) return;
    const client = getSupabaseBrowserAuthClient();
    if (!client) {
      setNotice({ tone: "error", message: "인증 서비스가 아직 설정되지 않았습니다." });
      return;
    }

    setIsResending(true);
    setNotice({ tone: "progress", message: "확인 메일을 다시 요청하고 있습니다." });
    try {
      const { error } = await client.auth.resend({
        type: "signup",
        email: pendingEmail,
        options: { emailRedirectTo: buildAuthCallbackUrl(window.location.origin, next) },
      });
      recordConfirmationEmailSent(window.localStorage);
      setResendWait(getConfirmationResendWaitSeconds(window.localStorage));
      setNotice(error
        ? { tone: "error", message: getAuthErrorMessage(error) }
        : { tone: "success", message: "확인 메일을 다시 보냈습니다. 받은 편지함과 스팸함을 확인해 주세요." });
    } catch {
      setNotice({ tone: "error", message: getAuthErrorMessage(null) });
    } finally {
      setIsResending(false);
    }
  }

  const signup = mode === "signup";
  return (
    <div className="scene-panel mx-auto w-full max-w-md p-5 sm:p-7">
      <form ref={formRef} onSubmit={submit} noValidate aria-busy={isSubmitting}>
        <div>
          <label htmlFor={`${mode}-email`} className="scene-label">이메일</label>
          <input
            id={`${mode}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            className="scene-input mt-2"
          />
        </div>
        <div className="mt-5">
          <label htmlFor={`${mode}-password`} className="scene-label">비밀번호</label>
          <input
            id={`${mode}-password`}
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={8}
            maxLength={72}
            className="scene-input mt-2"
            aria-describedby={signup ? `${mode}-password-help` : undefined}
          />
          {signup && <p id={`${mode}-password-help`} className="mt-2 text-sm text-muted">8자 이상 72자 이하로 입력해 주세요.</p>}
        </div>
        {signup && (
          <div className="mt-5">
            <label htmlFor="signup-password-confirmation" className="scene-label">비밀번호 확인</label>
            <input
              id="signup-password-confirmation"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              className="scene-input mt-2"
            />
          </div>
        )}

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

        <Button type="submit" className="mt-6 w-full" disabled={!isHydrated || isSubmitting || isResending}>
          {!isHydrated ? "준비 중…" : isSubmitting ? "처리 중…" : signup ? "회원가입" : "로그인"}
        </Button>
      </form>

      {pendingEmail && (
        <div className="mt-4 border-t border-line pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isResending || resendWait > 0}
            onClick={resendConfirmation}
          >
            {isResending ? "재발송 중…" : resendWait > 0 ? `${resendWait}초 후 다시 보내기` : "확인 메일 다시 보내기"}
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            재발송은 브라우저와 인증 서버 양쪽에서 제한됩니다.
          </p>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        {signup ? "이미 계정이 있나요?" : "아직 계정이 없나요?"}{" "}
        <Link href={signup ? `/login?next=${encodeURIComponent(next)}` : `/signup?next=${encodeURIComponent(next)}`} className="font-bold text-brand underline">
          {signup ? "로그인" : "회원가입"}
        </Link>
      </p>
      {!signup && (
        <p className="mt-3 text-center text-sm">
          <Link href="/forgot-password" className="font-bold text-brand underline">비밀번호를 잊으셨나요?</Link>
        </p>
      )}
    </div>
  );
}
