export type AuthErrorLike = {
  code?: string;
  status?: number;
};

export function getAuthErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return "인증 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }

  switch (error.code) {
    case "email_not_confirmed":
      return "이메일 확인이 아직 완료되지 않았습니다. 받은 편지함을 확인해 주세요.";
    case "invalid_credentials":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "weak_password":
      return "더 안전한 비밀번호를 사용해 주세요.";
    case "same_password":
      return "새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.";
    case "reauthentication_needed":
      return "보안을 위해 현재 비밀번호를 다시 확인해 주세요.";
    case "reauthentication_not_valid":
      return "현재 비밀번호가 올바르지 않습니다.";
    case "session_not_found":
    case "session_expired":
      return "세션이 만료되었습니다. 다시 로그인해 주세요.";
    case "email_provider_disabled":
    case "signup_disabled":
      return "현재 이메일 회원가입을 사용할 수 없습니다.";
    case "request_timeout":
      return "인증 서버 응답이 지연되고 있습니다. 다시 시도해 주세요.";
    case "flow_state_expired":
    case "flow_state_not_found":
    case "otp_expired":
      return "인증 링크가 만료되었습니다. 확인 메일을 다시 요청해 주세요.";
    default:
      return "인증 요청을 완료하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.";
  }
}

export function isEmailNotConfirmed(error: AuthErrorLike | null | undefined): boolean {
  return error?.code === "email_not_confirmed";
}

export function isExpiredAuthCallback(error: AuthErrorLike | null | undefined): boolean {
  return ["flow_state_expired", "flow_state_not_found", "otp_expired", "bad_code_verifier", "otp_disabled"]
    .includes(error?.code ?? "");
}
