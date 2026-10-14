/** Public display URLs, not an SSRF allowlist for arbitrary server fetching. */
export function getSafeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || /[\\\u0000-\u001f\u007f]/u.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Preserve normal source labels; never render a rejected URL as plain text. */
export function getSafeSourceText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = value.trim();
  if (candidate.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(candidate)) return null;
  return /^[a-z][a-z\d+.-]*:/iu.test(candidate) ? getSafeHttpUrl(candidate) : candidate;
}

/** Mock/local image assets may use root-relative paths, never network paths. */
export function getSafeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (/[\\\u0000-\u001f\u007f]/u.test(candidate)) return null;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  return getSafeHttpUrl(candidate);
}
