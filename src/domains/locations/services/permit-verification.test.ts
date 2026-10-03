import { describe, expect, it } from "vitest";
import {
  getPermitFreshness,
  isValidContactPhone,
  toPhoneHref,
} from "./permit-verification";

describe("permit verification metadata", () => {
  it.each(["02-2631-9368", "031-228-4470", "070-4277-8902", "+82 2 2153 0000"])(
    "accepts a sourced public phone number: %s",
    (phone) => expect(isValidContactPhone(phone)).toBe(true),
  );

  it.each(["", "담당자에게 문의", "02-12", "010-1234-5678 내선 3", "javascript:alert(1)"])(
    "rejects a malformed or annotated phone value: %s",
    (phone) => expect(isValidContactPhone(phone)).toBe(false),
  );

  it("creates a callable link only for a valid phone number", () => {
    expect(toPhoneHref("02-2631-9368")).toBe("tel:0226319368");
    expect(toPhoneHref("문의 페이지 참고")).toBeNull();
  });

  it("distinguishes current, stale, missing, malformed, and future verification dates", () => {
    const now = new Date("2026-10-03T12:00:00+09:00");
    expect(getPermitFreshness("2026-10-03T09:00:00+09:00", now)).toBe("current");
    expect(getPermitFreshness("2025-09-01T00:00:00+09:00", now)).toBe("stale");
    expect(getPermitFreshness(null, now)).toBe("missing");
    expect(getPermitFreshness("not-a-date", now)).toBe("invalid");
    expect(getPermitFreshness("2026-10-10T00:00:00+09:00", now)).toBe("future");
  });
});
