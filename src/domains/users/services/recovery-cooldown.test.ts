import { describe, expect, it } from "vitest";

import {
  getPasswordRecoveryWaitSeconds,
  PASSWORD_RECOVERY_STORAGE_KEY,
  recordPasswordRecoveryRequested,
} from "./recovery-cooldown";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("password recovery cooldown", () => {
  it("stores only a timestamp and never stores an email or token", () => {
    const storage = memoryStorage();
    recordPasswordRecoveryRequested(storage, 10_000);

    expect(storage.getItem(PASSWORD_RECOVERY_STORAGE_KEY)).toBe("10000");
    expect(getPasswordRecoveryWaitSeconds(storage, 10_000)).toBe(60);
    expect(getPasswordRecoveryWaitSeconds(storage, 40_100)).toBe(30);
    expect(getPasswordRecoveryWaitSeconds(storage, 70_000)).toBe(0);
  });

  it("fails open for malformed and future timestamps", () => {
    const storage = memoryStorage();
    storage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "not-a-number");
    expect(getPasswordRecoveryWaitSeconds(storage, 10_000)).toBe(0);
    storage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "20000");
    expect(getPasswordRecoveryWaitSeconds(storage, 10_000)).toBe(0);
  });
});
