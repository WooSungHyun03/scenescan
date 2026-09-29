import { describe, expect, it } from "vitest";
import {
  buildRegionQuery,
  collectCandidates,
  commonsTitleFromSpecialFilePath,
  deterministicUuid,
  parseDiscoveryArgs,
} from "./discover-wikidata.ts";

describe("Wikidata location discovery", () => {
  it("derives stable IDs and Commons titles", () => {
    expect(deterministicUuid("location:Q123")).toBe(deterministicUuid("location:Q123"));
    expect(deterministicUuid("location:Q123")).toMatch(/^[0-9a-f-]{36}$/);
    expect(commonsTitleFromSpecialFilePath("http://commons.wikimedia.org/wiki/Special:FilePath/Test%20place.jpg"))
      .toBe("File:Test place.jpg");
  });

  it("groups repeated category rows into one candidate", () => {
    const base = {
      item: { value: "http://www.wikidata.org/entity/Q123" },
      itemLabel: { value: "테스트 장소" },
      itemDescription: { value: "테스트 설명" },
      coord: { value: "Point(127.1 37.5)" },
      address: { value: "서울특별시 테스트로 1" },
      image: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Test.jpg" },
    };
    const candidates = collectCandidates([
      { ...base, category: { value: "urban" } },
      { ...base, category: { value: "interior" } },
    ], "서울");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ qid: "Q123", latitude: 37.5, longitude: 127.1 });
    expect([...candidates[0].categories]).toEqual(["urban", "interior"]);
  });

  it("builds bounded discovery queries and validates the cap", () => {
    expect(buildRegionQuery("Q8684")).toContain("wd:Q8684");
    expect(buildRegionQuery("Q8684")).toContain("LIMIT 1000");
    expect(() => parseDiscoveryArgs(["out.json", "--max", "0"])).toThrow("between 1 and 2000");
  });
});
