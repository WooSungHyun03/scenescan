"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/shared/ui/button";
import { SHORTLIST_AUTH_RESET_EVENT } from "@/domains/locations/components/shortlist-storage";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_CSRF_HEADER,
  ACCOUNT_DELETION_CSRF_VALUE,
} from "@/types/contracts";
import { clearAccountBrowserData } from "../services/account-browser-data";

type Notice = { tone: "error" | "progress"; message: string };
type ErrorBody = { error?: { code?: string; message?: string } };
const subscribeToHydration = () => () => undefined;

function clearSensitiveFields(form: HTMLFormElement): void {
  for (const name of ["currentPassword", "confirmation"]) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement) field.value = "";
  }
}

function getDeletionErrorMessage(status: number, body: ErrorBody | null): string {
  if (status === 401) return "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
  if (status === 403) return "현재 비밀번호가 올바르지 않거나 보안 확인에 실패했습니다.";
  if (status === 429) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (status === 503) return "계정을 삭제하지 못했습니다. 계정은 유지되며 잠시 후 다시 시도할 수 있습니다.";
  return body?.error?.message ?? "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function AccountDeletionForm() {
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
    const currentPassword = String(values.get("currentPassword") ?? "");
    const confirmation = String(values.get("confirmation") ?? "");
    if (currentPassword.length < 8 || currentPassword.length > 72
      || confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
      clearSensitiveFields(form);
      setNotice({ tone: "error", message: "현재 비밀번호와 ‘회원탈퇴’ 확인 문구를 정확히 입력해 주세요." });
      return;
    }

    setIsSubmitting(true);
    setNotice({ tone: "progress", message: "본인 확인 후 계정을 삭제하고 있습니다." });
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          [ACCOUNT_DELETION_CSRF_HEADER]: ACCOUNT_DELETION_CSRF_VALUE,
        },
        body: JSON.stringify({ currentPassword, confirmation }),
      });
      clearSensitiveFields(form);

      let body: ({ deleted?: unknown } & ErrorBody) | null = null;
      try {
        body = await response.json();
      } catch {
        // An invalid response body is never treated as successful deletion.
      }
      if (!response.ok || body?.deleted !== true) {
        setNotice({ tone: "error", message: getDeletionErrorMessage(response.status, body) });
        return;
      }

      try {
        clearAccountBrowserData(window.localStorage);
      } catch {
        // The response also carries Clear-Site-Data. Navigation still must
        // continue when browser storage is unavailable or blocked.
      }
      window.dispatchEvent(new Event(SHORTLIST_AUTH_RESET_EVENT));
      router.replace("/login?accountDeleted=1");
      router.refresh();
    } catch {
      clearSensitiveFields(form);
      setNotice({
        tone: "error",
        message: "네트워크 오류로 삭제 완료 여부를 확인하지 못했습니다. 다시 로그인해 계정 상태를 확인해 주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-busy={isSubmitting}>
      <div>
        <label htmlFor="delete-account-password" className="scene-label">현재 비밀번호</label>
        <input
          id="delete-account-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          maxLength={72}
          className="scene-input mt-2"
        />
      </div>
      <div className="mt-5">
        <label htmlFor="delete-account-confirmation" className="scene-label">
          확인을 위해 ‘{ACCOUNT_DELETION_CONFIRMATION}’ 입력
        </label>
        <input
          id="delete-account-confirmation"
          name="confirmation"
          type="text"
          autoComplete="off"
          required
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
      <Button
        type="submit"
        variant="outline"
        className="mt-6 w-full border-[var(--destructive)] text-[var(--destructive)] hover:bg-[var(--destructive-soft)] sm:w-auto"
        disabled={!hydrated || isSubmitting}
      >
        {!hydrated ? "준비 중…" : isSubmitting ? "삭제 중…" : "계정 영구 삭제"}
      </Button>
    </form>
  );
}
