import { describe, expect, it } from "vitest";

import {
  AUTH_RESEND_STORAGE_KEY,
  getConfirmationResendWaitSeconds,
  recordConfirmationEmailSent,
} from "./resend-cooldown";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("confirmation resend cooldown", () => {
  it("stores only a timestamp and counts down without storing an email", () => {
    const storage = memoryStorage();
    recordConfirmationEmailSent(storage, 1_000);

    expect(storage.getItem(AUTH_RESEND_STORAGE_KEY)).toBe("1000");
    expect(getConfirmationResendWaitSeconds(storage, 1_000)).toBe(60);
    expect(getConfirmationResendWaitSeconds(storage, 31_100)).toBe(30);
    expect(getConfirmationResendWaitSeconds(storage, 61_000)).toBe(0);
  });

  it("fails open for absent, malformed, or future timestamps", () => {
    const storage = memoryStorage();
    expect(getConfirmationResendWaitSeconds(storage, 1_000)).toBe(0);
    storage.setItem(AUTH_RESEND_STORAGE_KEY, "invalid");
    expect(getConfirmationResendWaitSeconds(storage, 1_000)).toBe(0);
    storage.setItem(AUTH_RESEND_STORAGE_KEY, "2000");
    expect(getConfirmationResendWaitSeconds(storage, 1_000)).toBe(0);
  });
});
