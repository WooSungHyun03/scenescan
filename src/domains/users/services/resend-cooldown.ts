export const AUTH_RESEND_COOLDOWN_SECONDS = 60;
export const AUTH_RESEND_STORAGE_KEY = "scenescan:auth:confirmation-resend-at:v1";

type ResendStorage = Pick<Storage, "getItem" | "setItem">;

export function recordConfirmationEmailSent(storage: ResendStorage, now = Date.now()): void {
  storage.setItem(AUTH_RESEND_STORAGE_KEY, String(now));
}

export function getConfirmationResendWaitSeconds(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
): number {
  const sentAt = Number(storage.getItem(AUTH_RESEND_STORAGE_KEY));
  if (!Number.isFinite(sentAt) || sentAt <= 0 || sentAt > now) return 0;
  return Math.max(0, Math.ceil(AUTH_RESEND_COOLDOWN_SECONDS - (now - sentAt) / 1_000));
}
