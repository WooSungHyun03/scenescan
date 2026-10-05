import { describe, expect, it, vi } from "vitest";

import { SHORTLIST_STORAGE_KEY } from "@/domains/locations/components/shortlist-storage";
import { PASSWORD_RECOVERY_STORAGE_KEY } from "./recovery-cooldown";
import { AUTH_RESEND_STORAGE_KEY } from "./resend-cooldown";
import { clearAccountBrowserData } from "./account-browser-data";

describe("account browser data cleanup", () => {
  it("clears auth cooldowns and the device shortlist after confirmed deletion", () => {
    const removeItem = vi.fn();
    clearAccountBrowserData({ removeItem });

    expect(removeItem.mock.calls.map(([key]) => key)).toEqual([
      AUTH_RESEND_STORAGE_KEY,
      PASSWORD_RECOVERY_STORAGE_KEY,
      SHORTLIST_STORAGE_KEY,
    ]);
  });
});
