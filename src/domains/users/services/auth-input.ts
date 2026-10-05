import { z } from "zod";

const email = z.string().trim().email("올바른 이메일 주소를 입력해 주세요.").max(254);
const password = z.string()
  .min(8, "비밀번호는 8자 이상이어야 합니다.")
  .max(72, "비밀번호는 72자 이하여야 합니다.");

export const loginInputSchema = z.object({ email, password });
export const forgotPasswordInputSchema = z.object({ email });
export const signupInputSchema = loginInputSchema.extend({
  passwordConfirmation: z.string(),
}).superRefine((value, context) => {
  if (value.password === value.passwordConfirmation) return;
  context.addIssue({
    code: "custom",
    path: ["passwordConfirmation"],
    message: "비밀번호 확인이 일치하지 않습니다.",
  });
});

export const recoveryPasswordInputSchema = z.object({
  password,
  passwordConfirmation: z.string(),
}).superRefine((value, context) => {
  if (value.password === value.passwordConfirmation) return;
  context.addIssue({
    code: "custom",
    path: ["passwordConfirmation"],
    message: "비밀번호 확인이 일치하지 않습니다.",
  });
});

export const accountPasswordInputSchema = recoveryPasswordInputSchema.safeExtend({
  currentPassword: password,
}).superRefine((value, context) => {
  if (value.currentPassword !== value.password) return;
  context.addIssue({
    code: "custom",
    path: ["password"],
    message: "새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.",
  });
});

export function getAuthInputError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "입력 내용을 확인해 주세요.";
}
