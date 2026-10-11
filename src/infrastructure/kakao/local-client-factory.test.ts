import { describe, expect, it } from "vitest";
import { getKakaoLocalAdapter } from "./local-client-factory";

describe("getKakaoLocalAdapter", () => {
  it("returns null in the default key-free environment", () => {
    expect(getKakaoLocalAdapter()).toBeNull();
  });
});
