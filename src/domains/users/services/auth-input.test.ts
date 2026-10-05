import { describe, expect, it } from "vitest";

import {
  accountPasswordInputSchema,
  forgotPasswordInputSchema,
  getAuthInputError,
  loginInputSchema,
  recoveryPasswordInputSchema,
  signupInputSchema,
} from "./auth-input";

describe("auth form input", () => {
  it("normalizes email without changing the password", () => {
    expect(loginInputSchema.parse({ email: " user@example.com ", password: "pass word 123" }))
      .toEqual({ email: "user@example.com", password: "pass word 123" });
  });

  it("rejects malformed email and short passwords", () => {
    expect(loginInputSchema.safeParse({ email: "bad", password: "short" }).success).toBe(false);
  });

  it("requires matching signup passwords", () => {
    const result = signupInputSchema.safeParse({
      email: "user@example.com",
      password: "long-password",
      passwordConfirmation: "different-password",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(getAuthInputError(result.error)).toBe("비밀번호 확인이 일치하지 않습니다.");
  });

  it("validates recovery email without requiring or retaining a password", () => {
    expect(forgotPasswordInputSchema.parse({ email: " user@example.com " }))
      .toEqual({ email: "user@example.com" });
  });

  it("requires matching recovery passwords and a different current password", () => {
    expect(recoveryPasswordInputSchema.safeParse({
      password: "new-password",
      passwordConfirmation: "not-matching",
    }).success).toBe(false);
    expect(accountPasswordInputSchema.safeParse({
      currentPassword: "same-password",
      password: "same-password",
      passwordConfirmation: "same-password",
    }).success).toBe(false);
    expect(accountPasswordInputSchema.safeParse({
      currentPassword: "old-password",
      password: "new-password",
      passwordConfirmation: "new-password",
    }).success).toBe(true);
  });
});
