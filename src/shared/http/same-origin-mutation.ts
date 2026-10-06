import type { NextRequest } from "next/server";

import { forbiddenError } from "@/shared/errors/application-error";

type SameOriginMutationOptions = {
  csrfHeader: string;
  csrfValue: string;
  operation: string;
};

/**
 * Verifies browser mutation metadata against the public request target.
 * Host/x-forwarded-host are used before Next's normalized internal URL so
 * reverse proxies do not produce false cross-origin failures.
 */
export function assertSameOriginMutation(
  request: NextRequest,
  options: SameOriginMutationOptions,
): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  let originUrl: URL | null = null;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {
    originUrl = null;
  }

  const requestHosts = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim(),
  ].filter((host): host is string => Boolean(host));
  if (requestHosts.length === 0) requestHosts.push(request.nextUrl.host);

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const requestProtocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : request.nextUrl.protocol.replace(":", "");

  if (
    !originUrl
    || !requestHosts.includes(originUrl.host)
    || requestProtocol !== originUrl.protocol.replace(":", "")
  ) {
    throw forbiddenError(`${options.operation} rejected a missing or cross-origin Origin header`);
  }
  if (fetchSite && fetchSite !== "same-origin") {
    throw forbiddenError(`${options.operation} rejected a cross-site Fetch Metadata value`);
  }
  if (request.headers.get(options.csrfHeader) !== options.csrfValue) {
    throw forbiddenError(`${options.operation} rejected a missing CSRF request header`);
  }
}
