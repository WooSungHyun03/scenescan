import { describe, expect, it } from "vitest";
import { getSearchSession, setSearchImageDraft, setSearchSession, takeSearchImageDraft } from "./search-image-draft";

describe("transient search navigation", () => {
  it("hands a home image to search once without serializing the file", () => {
    const file = new File(["image"], "scene.png", { type: "image/png" });
    setSearchImageDraft(file);
    expect(takeSearchImageDraft()).toBe(file);
    expect(takeSearchImageDraft()).toBeNull();
  });
  it("retains the current search when visiting a location and can clear it", () => {
    const file = new File(["image"], "scene.png", { type: "image/png" });
    const emptyText = { query: "", results: null, parsedQuery: null, unsupportedConditions: [], notice: null };
    setSearchSession({ mode: "image", file, district: "busan_haeundae_gu", category: "industrial", results: [], text: emptyText });
    expect(getSearchSession()).toEqual({ mode: "image", file, district: "busan_haeundae_gu", category: "industrial", results: [], text: emptyText });
    setSearchSession({ mode: "image", file: null, district: "", category: "", results: null, text: emptyText });
    expect(getSearchSession()?.file).toBeNull();
    expect(getSearchSession()?.results).toBeNull();
  });

  it("keeps text-mode state independent from image-mode state", () => {
    const textState = {
      query: "해운대 맛집",
      results: [],
      parsedQuery: { district: "busan_haeundae_gu" as const, category: null, keywords: ["맛집"], districtConflict: false },
      unsupportedConditions: [],
      notice: null,
    };
    setSearchSession({ mode: "text", file: null, district: "", category: "", results: null, text: textState });
    expect(getSearchSession()?.mode).toBe("text");
    expect(getSearchSession()?.text).toEqual(textState);
    expect(getSearchSession()?.results).toBeNull();
  });
});
