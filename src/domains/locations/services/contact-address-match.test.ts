import { describe, expect, it } from "vitest";
import { contactAddressesMatch } from "./contact-address-match";

describe("contactAddressesMatch", () => {
  it("accepts the same street and single-digit building with an administrative spelling variation", () => {
    expect(contactAddressesMatch("부산광역시 남구 테스트로 1", "부산 남구 테스트로 1")).toBe(true);
  });
  it.each([null, "부산 남구", "부산 남구 다른로 1", "부산 남구 테스트로 10", "부산 북구 테스트로 1"])(
    "rejects missing or unrelated facility address %s", (candidate) => {
      expect(contactAddressesMatch("부산광역시 남구 테스트로 1", candidate)).toBe(false);
    },
  );
  it("does not combine a road from one address and a number from another", () => {
    expect(contactAddressesMatch("부산 남구 테스트로 1", "부산 남구 테스트로")).toBe(false);
  });
});
