import { describe, expect, it } from "vitest";
import { getSafeHttpUrl, getSafeImageUrl, getSafeSourceText } from "./safe-url";

describe("public URL boundaries", () => {
  it("preserves ordinary provenance labels and safe URL query/hash", () => {
    expect(getSafeSourceText(" Wikimedia Commons ")).toBe("Wikimedia Commons");
    expect(getSafeHttpUrl("https://example.com/image?q=1#source")).toBe("https://example.com/image?q=1#source");
    expect(getSafeImageUrl("/images/부산.jpg")).toBe("/images/부산.jpg");
  });
  it.each([null, "", "javascript:alert(1)", "data:image/png;base64,test", "https://user:fake-canary@example.com/a", "https://example.com/a\nb", "https:\\example.com/a", "//example.com/a"])("rejects unsafe HTTP URL %s", (url) => {
    expect(getSafeHttpUrl(url)).toBeNull();
    expect(getSafeImageUrl(url)).toBeNull();
  });
  it("never falls back to displaying a rejected URL as a source label", () => {
    expect(getSafeSourceText("https://user:fake-canary@example.com/a")).toBeNull();
    expect(getSafeSourceText("javascript:alert(1)")).toBeNull();
    expect(getSafeSourceText("//user:fake-canary@example.com/a")).toBeNull();
  });
});
