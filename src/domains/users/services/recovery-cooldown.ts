export const PASSWORD_RECOVERY_COOLDOWN_SECONDS = 60;
export const PASSWORD_RECOVERY_STORAGE_KEY = "scenescan:auth:password-recovery-sent-at:v1";

type RecoveryStorage = Pick<Storage, "getItem" | "setItem">;

export function recordPasswordRecoveryRequested(storage: RecoveryStorage, now = Date.now()): void {
  storage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, String(now));
}

export function getPasswordRecoveryWaitSeconds(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
): number {
  const requestedAt = Number(storage.getItem(PASSWORD_RECOVERY_STORAGE_KEY));
  if (!Number.isFinite(requestedAt) || requestedAt <= 0 || requestedAt > now) return 0;
  return Math.max(0, Math.ceil(PASSWORD_RECOVERY_COOLDOWN_SECONDS - (now - requestedAt) / 1_000));
}
