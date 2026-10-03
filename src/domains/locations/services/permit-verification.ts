const DAY_MS = 24 * 60 * 60 * 1_000;

export const PERMIT_INFORMATION_MAX_AGE_DAYS = 365;

export type PermitFreshness = "missing" | "invalid" | "future" | "current" | "stale";

export function isValidContactPhone(value: string): boolean {
  const phone = value.trim();
  if (!/^\+?[0-9][0-9() .-]{5,23}$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function toPhoneHref(value: string | null | undefined): string | null {
  if (!value || !isValidContactPhone(value)) return null;
  const phone = value.trim();
  const prefix = phone.startsWith("+") ? "+" : "";
  return `tel:${prefix}${phone.replace(/\D/g, "")}`;
}

export function getPermitFreshness(
  lastVerifiedAt: string | null | undefined,
  now = new Date(),
  maxAgeDays = PERMIT_INFORMATION_MAX_AGE_DAYS,
): PermitFreshness {
  if (!lastVerifiedAt) return "missing";
  const verifiedAt = new Date(lastVerifiedAt);
  if (!Number.isFinite(verifiedAt.getTime())) return "invalid";
  const ageDays = (now.getTime() - verifiedAt.getTime()) / DAY_MS;
  if (ageDays < -1) return "future";
  return ageDays > maxAgeDays ? "stale" : "current";
}
