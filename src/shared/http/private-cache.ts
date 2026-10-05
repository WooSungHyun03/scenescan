export const PRIVATE_CACHE_CONTROL = "private, no-cache, no-store, must-revalidate, max-age=0";

export function applyPrivateResponseCacheHeaders(headers: Headers): void {
  headers.set("Cache-Control", PRIVATE_CACHE_CONTROL);
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  const vary = new Set(
    (headers.get("Vary") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  vary.add("Cookie");
  headers.set("Vary", [...vary].join(", "));
}
