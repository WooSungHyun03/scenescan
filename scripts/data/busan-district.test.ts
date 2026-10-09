import { describe, expect, it } from "vitest";
import { resolveBusanDistrict } from "./busan-district.ts";

const HAEUNDAE_POINT = { latitude: 35.1587, longitude: 129.1604 };
const SUYEONG_POINT = { latitude: 35.1686, longitude: 129.1134 };
const SEOUL_POINT = { latitude: 37.5665, longitude: 126.978 };

describe("resolveBusanDistrict", () => {
  it("resolves a district from its full label in the address", () => {
    const result = resolveBusanDistrict({ address: "부산광역시 해운대구 우동 123", ...HAEUNDAE_POINT });
    expect(result).toEqual({ district: "busan_haeundae_gu", status: "resolved", reason: "ADDRESS_MATCH" });
  });

  it("resolves a district from its short form when it is at least 2 characters", () => {
    const result = resolveBusanDistrict({ address: "부산 해운대 달맞이길 62", ...HAEUNDAE_POINT });
    expect(result).toEqual({ district: "busan_haeundae_gu", status: "resolved", reason: "ADDRESS_MATCH" });
  });

  it("never matches the 1-character short forms of 중/서/동/남/북구", () => {
    // "동래구" contains "동" as a substring, but "동" alone must never
    // match -- it would false-positive almost any address.
    const result = resolveBusanDistrict({ address: "부산 동래구 온천동", latitude: 35.2048, longitude: 129.0839 });
    expect(result.district).toBe("busan_dongnae_gu");
    // Confirm the 1-char short forms specifically are excluded: an address
    // that only contains "동" and nothing else never resolves.
    const ambiguous = resolveBusanDistrict({ address: "부산 동 1번지", ...HAEUNDAE_POINT });
    expect(ambiguous).toMatchObject({ district: null, status: "needs-review", reason: "NO_DISTRICT_IN_ADDRESS" });
  });

  it("flags a coordinate outside the Busan city bounding box for review, regardless of address text", () => {
    const result = resolveBusanDistrict({ address: "부산광역시 해운대구 우동 123", ...SEOUL_POINT });
    expect(result).toEqual({ district: null, status: "needs-review", reason: "COORDINATE_OUTSIDE_BUSAN" });
  });

  it("flags an address with no recognizable district for review rather than guessing", () => {
    const result = resolveBusanDistrict({ address: "부산광역시 동부 어딘가", ...HAEUNDAE_POINT });
    expect(result).toEqual({ district: null, status: "needs-review", reason: "NO_DISTRICT_IN_ADDRESS" });
  });

  it("flags an address naming two different districts for review rather than guessing one", () => {
    const result = resolveBusanDistrict({ address: "해운대구와 수영구 사이", ...HAEUNDAE_POINT });
    expect(result.status).toBe("needs-review");
    expect(result).toMatchObject({ district: null, reason: "MULTIPLE_DISTRICTS_IN_ADDRESS" });
    expect((result as { matchedDistricts?: string[] }).matchedDistricts).toEqual(
      expect.arrayContaining(["busan_haeundae_gu", "busan_suyeong_gu"]),
    );
  });

  it("resolves every one of the 16 districts from its own full label", () => {
    const addresses: Record<string, string> = {
      busan_jung_gu: "부산광역시 중구", busan_seo_gu: "부산광역시 서구", busan_dong_gu: "부산광역시 동구",
      busan_yeongdo_gu: "부산광역시 영도구", busan_busanjin_gu: "부산광역시 부산진구", busan_dongnae_gu: "부산광역시 동래구",
      busan_nam_gu: "부산광역시 남구", busan_buk_gu: "부산광역시 북구", busan_haeundae_gu: "부산광역시 해운대구",
      busan_saha_gu: "부산광역시 사하구", busan_geumjeong_gu: "부산광역시 금정구", busan_gangseo_gu: "부산광역시 강서구",
      busan_yeonje_gu: "부산광역시 연제구", busan_suyeong_gu: "부산광역시 수영구", busan_sasang_gu: "부산광역시 사상구",
      busan_gijang_gun: "부산광역시 기장군",
    };
    for (const [district, address] of Object.entries(addresses)) {
      expect(resolveBusanDistrict({ address, ...SUYEONG_POINT }).district).toBe(district);
    }
  });

  it("never treats '경기장' (stadium) as naming 기장군, even though 기장 is otherwise a valid short form", () => {
    const result = resolveBusanDistrict({ address: "부산 수영구 주경기장 인근", ...SUYEONG_POINT });
    expect(result.district).toBe("busan_suyeong_gu");
  });
});
