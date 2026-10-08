"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserAuthClient } from "@/infrastructure/supabase/browser-auth-client";
import { Button } from "@/shared/ui/button";
import { getAuthErrorMessage } from "../services/auth-error";
import { reauthenticatePassword } from "../services/password-reauthentication";
import {
  accountPasswordInputSchema,
  getAuthInputError,
  recoveryPasswordInputSchema,
} from "../services/auth-input";

type PasswordUpdateMode = "account" | "recovery";
type Notice = { tone: "error" | "progress" | "success"; message: string };
const subscribeToHydration = () => () => undefined;

function clearPasswordFields(form: HTMLFormElement): void {
  for (const name of ["currentPassword", "password", "passwordConfirmation"]) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement) field.value = "";
  }
}

export function PasswordUpdateForm({ mode }: { mode: PasswordUpdateMode }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const values = new FormData(form);
    const input = {
      currentPassword: String(values.get("currentPassword") ?? ""),
      password: String(values.get("password") ?? ""),
      passwordConfirmation: String(values.get("passwordConfirmation") ?? ""),
    };
    const parsed = mode === "account"
      ? accountPasswordInputSchema.safeParse(input)
      : recoveryPasswordInputSchema.safeParse(input);
    if (!parsed.success) {
      clearPasswordFields(form);
      setNotice({ tone: "error", message: getAuthInputError(parsed.error) });
      return;
    }

    const client = getSupabaseBrowserAuthClient();
    if (!client) {
      clearPasswordFields(form);
      setNotice({ tone: "error", message: "인증 서비스가 설정되지 않았습니다." });
      return;
    }

    setIsSubmitting(true);
    setNotice({ tone: "progress", message: "비밀번호를 안전하게 변경하고 있습니다." });
    try {
      if (mode === "account") {
        const error = await reauthenticatePassword(client, input.currentPassword);
        if (error) {
          clearPasswordFields(form);
          setNotice({
            tone: "error",
            message: error.code === "invalid_credentials"
              ? "현재 비밀번호가 올바르지 않습니다."
              : getAuthErrorMessage(error),
          });
          return;
        }
      }
      const attributes = mode === "account"
        ? { password: parsed.data.password, current_password: input.currentPassword }
        : { password: parsed.data.password };
      const { error } = await client.auth.updateUser(attributes);
      clearPasswordFields(form);
      if (error) {
        setNotice({
          tone: "error",
          message: mode === "account" && error.code === "invalid_credentials"
            ? "현재 비밀번호가 올바르지 않습니다."
            : getAuthErrorMessage(error),
        });
        return;
      }

      // SceneScan policy: a password change ends every refreshable session.
      // If the provider-wide request cannot be confirmed, still clear this
      // browser and tell the user not to assume other devices were signed out.
      const { error: globalSignOutError } = await client.auth.signOut({ scope: "global" });
      if (globalSignOutError) await client.auth.signOut({ scope: "local" });
      const query = new URLSearchParams({ passwordChanged: "1" });
      if (globalSignOutError) query.set("sessionCleanup", "partial");
      router.replace(`/login?${query.toString()}`);
      router.refresh();
    } catch {
      clearPasswordFields(form);
      setNotice({ tone: "error", message: getAuthErrorMessage(null) });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-busy={isSubmitting}>
      {mode === "account" && (
        <div>
          <label htmlFor="current-password" className="scene-label">현재 비밀번호</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={72}
            className="scene-input mt-2"
          />
        </div>
      )}
      <div className={mode === "account" ? "mt-5" : undefined}>
        <label htmlFor={`${mode}-new-password`} className="scene-label">새 비밀번호</label>
        <input
          id={`${mode}-new-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          className="scene-input mt-2"
          aria-describedby={`${mode}-password-help`}
        />
        <p id={`${mode}-password-help`} className="mt-2 text-sm leading-relaxed text-muted">
          8자 이상 72자 이하로 입력해 주세요. 변경 후 모든 기기에서 다시 로그인해야 합니다.
        </p>
      </div>
      <div className="mt-5">
        <label htmlFor={`${mode}-password-confirmation`} className="scene-label">새 비밀번호 확인</label>
        <input
          id={`${mode}-password-confirmation`}
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          className="scene-input mt-2"
        />
      </div>
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
      <Button type="submit" className="mt-6 w-full sm:w-auto" disabled={!hydrated || isSubmitting}>
        {!hydrated ? "준비 중…" : isSubmitting ? "변경 중…" : "비밀번호 변경"}
      </Button>
    </form>
  );
}
