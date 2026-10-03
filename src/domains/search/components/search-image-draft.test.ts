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
    setSearchSession({ file, region: "서울", category: "industrial", results: [] });
    expect(getSearchSession()).toEqual({ file, region: "서울", category: "industrial", results: [] });
    setSearchSession({ file: null, region: "", category: "", results: null });
    expect(getSearchSession()?.file).toBeNull();
    expect(getSearchSession()?.results).toBeNull();
  });
});
