import { SHORTLIST_STORAGE_KEY } from "@/domains/locations/components/shortlist-storage";
import { PASSWORD_RECOVERY_STORAGE_KEY } from "./recovery-cooldown";
import { AUTH_RESEND_STORAGE_KEY } from "./resend-cooldown";

const accountBrowserStorageKeys = [
  AUTH_RESEND_STORAGE_KEY,
  PASSWORD_RECOVERY_STORAGE_KEY,
  SHORTLIST_STORAGE_KEY,
] as const;

export function clearAccountBrowserData(storage: Pick<Storage, "removeItem">): void {
  for (const key of accountBrowserStorageKeys) storage.removeItem(key);
}
