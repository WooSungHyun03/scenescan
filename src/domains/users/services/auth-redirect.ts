const AUTH_REDIRECT_ORIGIN = "https://scenescan.invalid";
const locationIdPattern = /^\/locations\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const allowedExactPaths = new Set(["/", "/account", "/account/security", "/search", "/shortlist"]);

function isAllowedPath(pathname: string): boolean {
  return allowedExactPaths.has(pathname) || locationIdPattern.test(pathname);
}

/**
 * Auth redirects are deliberately allow-listed. Same-origin alone is not
 * enough because backslashes and protocol-relative values can be normalized
 * into an external URL by URL parsers or browsers.
 */
export function getSafeAuthRedirect(
  value: string | null | undefined,
  fallback = "/account",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const url = new URL(value, AUTH_REDIRECT_ORIGIN);
    if (url.origin !== AUTH_REDIRECT_ORIGIN || !isAllowedPath(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function buildAuthCallbackUrl(origin: string, next: string): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", getSafeAuthRedirect(next));
  return url.toString();
}

export function buildPasswordRecoveryCallbackUrl(origin: string): string {
  return new URL("/auth/recovery", origin).toString();
}
