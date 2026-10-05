import { describe, expect, it } from "vitest";

import { getAuthErrorMessage, isEmailNotConfirmed, isExpiredAuthCallback } from "./auth-error";

describe("auth error presentation", () => {
  it("distinguishes confirmation, expiry, rate-limit, and credential errors by stable code", () => {
    expect(getAuthErrorMessage({ code: "email_not_confirmed" })).toContain("이메일 확인");
    expect(getAuthErrorMessage({ code: "invalid_credentials" })).toContain("이메일 또는 비밀번호");
    expect(getAuthErrorMessage({ status: 429 })).toContain("요청이 너무 많습니다");
    expect(getAuthErrorMessage({ code: "flow_state_expired" })).toContain("만료");
    expect(getAuthErrorMessage({ code: "reauthentication_not_valid" })).toContain("현재 비밀번호");
    expect(getAuthErrorMessage({ code: "same_password" })).toContain("다르게");
  });

  it("does not expose provider error messages", () => {
    expect(getAuthErrorMessage({ code: "unknown_internal_error" }))
      .not.toContain("unknown_internal_error");
  });

  it("classifies confirmation and callback expiry", () => {
    expect(isEmailNotConfirmed({ code: "email_not_confirmed" })).toBe(true);
    expect(isExpiredAuthCallback({ code: "bad_code_verifier" })).toBe(true);
    expect(isExpiredAuthCallback({ code: "invalid_credentials" })).toBe(false);
  });
});
