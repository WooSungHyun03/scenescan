import { describe, expect, it } from "vitest";
import {
  buildRegionQuery,
  collectCandidates,
  commonsTitleFromSpecialFilePath,
  consolidateCandidates,
  deterministicUuid,
  filterCandidatesForDeficientCells,
  getCandidateReviewItem,
  parseDiscoveryArgs,
  parseReviewDecisions,
  prioritizeReviewQueue,
  resolveCandidateCategory,
  selectCoverageCandidates,
  type Candidate,
  type ReadyCandidate,
} from "./discover-wikidata.ts";
import { createCoverageReport } from "./coverage.ts";

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    qid: "Q123",
    name: "테스트 장소",
    description: "테스트 설명",
    region: "서울",
    address: "서울특별시 테스트로 1",
    latitude: 37.5,
    longitude: 127.1,
    categories: new Set(["urban"]),
    imageTitles: new Set(["File:Test.jpg"]),
    typeLabels: new Set(["building"]),
    matchedRegions: new Set(["서울"]),
    addressesByRegion: { 서울: "서울특별시 테스트로 1" },
    ...overrides,
  };
}

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
    const query = buildRegionQuery("Q8684");
    expect(query).toContain("wd:Q8684");
    expect(query).toContain("LIMIT 1000");
    expect(query).toContain("OPTIONAL { ?item wdt:P6375 ?address. }");
    expect(query).toContain('wd:Q1662011 "industrial"');
    expect(query).not.toContain("Q166142");
    expect(() => parseDiscoveryArgs(["out.json", "--max", "0"])).toThrow("between 1 and 2000");
    expect(() => parseDiscoveryArgs(["out.json", "--target", "0"])).toThrow("between 1 and 20");
  });

  it("parses an optional --region scope and rejects an unrecognized region", () => {
    expect(parseDiscoveryArgs(["out.json", "--region", "부산"]).region).toBe("부산");
    expect(parseDiscoveryArgs(["out.json"]).region).toBeNull();
    expect(() => parseDiscoveryArgs(["out.json", "--region", "Atlantis"])).toThrow(/--region must be one of/);
  });

  it("uses a reviewed administrative-area fallback when Wikidata has no street address", () => {
    const candidates = collectCandidates([{
      item: { value: "http://www.wikidata.org/entity/Q125" },
      itemLabel: { value: "테스트 동굴" },
      itemDescription: { value: "테스트 설명" },
      coord: { value: "Point(128.2 37.2)" },
      adminLabel: { value: "강릉시" },
      image: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Cave.jpg" },
      category: { value: "nature" },
      typeLabel: { value: "동굴" },
    }], "강원");
    expect(candidates[0]).toMatchObject({ address: "강원 강릉시" });
  });

  it("queues multi-category and representative places instead of applying category priority", () => {
    const mixed = candidate({ categories: new Set(["urban", "interior"]) });
    expect(getCandidateReviewItem(mixed)).toMatchObject({
      reasons: ["MULTIPLE_CATEGORIES"],
      categories: ["urban", "interior"],
    });

    const park = candidate({
      qid: "Q124",
      name: "테스트 공원",
      categories: new Set(["nature"]),
      typeLabels: new Set(["urban park"]),
    });
    expect(getCandidateReviewItem(park)).toMatchObject({
      reasons: ["REPRESENTATIVE_CASE"],
      representativeCases: ["park"],
    });

    const river = candidate({
      qid: "Q126",
      name: "테스트강",
      categories: new Set(["nature"]),
      typeLabels: new Set(["river"]),
    });
    expect(getCandidateReviewItem(river)).toMatchObject({
      reasons: ["REPRESENTATIVE_CASE"],
      representativeCases: ["river"],
    });

    const tidalFlat = candidate({
      qid: "Q127",
      name: "Gochang tidal flats",
      categories: new Set(["nature"]),
      typeLabels: new Set(["nature reserve"]),
    });
    expect(getCandidateReviewItem(tidalFlat)).toMatchObject({
      reasons: ["REPRESENTATIVE_CASE"],
      representativeCases: ["tidal-flat"],
    });
  });

  it("queues the same Wikidata entity when it resolves to multiple regions", () => {
    const consolidated = consolidateCandidates([
      candidate(),
      candidate({
        region: "경기",
        address: "경기도 테스트로 2",
        matchedRegions: new Set(["경기"]),
        addressesByRegion: { 경기: "경기도 테스트로 2" },
      }),
    ]);
    expect(consolidated).toHaveLength(1);
    expect(getCandidateReviewItem(consolidated[0])).toMatchObject({
      reasons: ["MULTIPLE_REGIONS"],
      regions: ["서울", "경기"],
      addressesByRegion: {
        서울: "서울특별시 테스트로 1",
        경기: "경기도 테스트로 2",
      },
      latitude: 37.5,
      longitude: 127.1,
    });
  });

  it("uses the address belonging to the manually selected region", () => {
    const multiRegion = candidate({
      matchedRegions: new Set(["서울", "경기"]),
      addressesByRegion: {
        서울: "서울특별시 테스트로 1",
        경기: "경기도 테스트로 2",
      },
    });
    const decisions = parseReviewDecisions({
      schema_version: 1,
      decisions: [{
        qid: "Q123",
        decision: "accept",
        category: "urban",
        region: "경기",
        note: "공식 원문의 좌표와 행정구역을 확인",
        reviewed_by: "member-4",
        reviewed_at: "2026-10-01T09:00:00+09:00",
      }],
    });

    expect(resolveCandidateCategory(multiRegion, decisions)).toMatchObject({
      category: "urban",
      region: "경기",
      address: "경기도 테스트로 2",
    });
  });

  it("requires explicit, attributable review decisions", () => {
    const decisions = parseReviewDecisions({
      schema_version: 1,
      decisions: [{
        qid: "Q123",
        decision: "accept",
        category: "interior",
        note: "실내 촬영 공간으로 수동 확인",
        reviewed_by: "member-4",
        reviewed_at: "2026-10-01T09:00:00+09:00",
      }],
    });
    expect(decisions.get("Q123")).toMatchObject({ decision: "accept", category: "interior" });
    expect(() => parseReviewDecisions({
      schema_version: 1,
      decisions: [
        { qid: "Q123", decision: "reject", note: "부적절", reviewed_by: "a", reviewed_at: "2026-10-01T09:00:00+09:00" },
        { qid: "Q123", decision: "reject", note: "중복", reviewed_by: "b", reviewed_at: "2026-10-01T09:00:00+09:00" },
      ],
    })).toThrow("Duplicate review decision");
  });

  it("selects only deficient cells and blocks near-duplicate coordinates", () => {
    const base = [
      { name: "서울 A", region: "서울" as const, category: "urban" as const, latitude: 37.5, longitude: 127 },
      { name: "서울 B", region: "서울" as const, category: "urban" as const, latitude: 37.6, longitude: 127 },
    ];
    const ready = (value: Candidate, category: ReadyCandidate["category"]): ReadyCandidate => ({
      ...value,
      category,
      licensedImageTitles: [...value.imageTitles],
    });
    const result = selectCoverageCandidates([
      ready(candidate({ qid: "Q200", imageTitles: new Set(["File:Urban.jpg"]) }), "urban"),
      ready(candidate({
        qid: "Q201",
        name: "부산 자연",
        region: "부산",
        address: "부산광역시 테스트로 1",
        latitude: 35.1,
        longitude: 129.1,
        categories: new Set(["nature"]),
        imageTitles: new Set(["File:Nature.jpg"]),
      }), "nature"),
      ready(candidate({
        qid: "Q202",
        name: "부산 자연 중복",
        region: "부산",
        address: "부산광역시 테스트로 2",
        latitude: 35.1001,
        longitude: 129.1001,
        categories: new Set(["nature"]),
        imageTitles: new Set(["File:Duplicate.jpg"]),
      }), "nature"),
    ], base, new Set(), 10, 2);

    expect(result.accepted.map((item) => item.qid)).toEqual(["Q201"]);
    expect(result.duplicateQids).toEqual(["Q202"]);
  });

  it("filters and orders review work by the deficient coverage cells", () => {
    const coverage = createCoverageReport([
      { region: "서울", category: "urban" },
      { region: "서울", category: "urban" },
      { region: "부산", category: "nature" },
    ], 2);
    const fullCell = candidate({ qid: "Q300" });
    const oneMissing = candidate({
      qid: "Q301",
      name: "부산 테스트 공원",
      region: "부산",
      categories: new Set(["nature"]),
      matchedRegions: new Set(["부산"]),
      addressesByRegion: { 부산: "부산광역시 테스트로 1" },
    });
    const emptyCell = candidate({
      qid: "Q302",
      name: "제주 테스트 공원",
      region: "제주",
      categories: new Set(["nature"]),
      matchedRegions: new Set(["제주"]),
      addressesByRegion: { 제주: "제주특별자치도 테스트로 1" },
    });

    expect(filterCandidatesForDeficientCells([fullCell, oneMissing, emptyCell], coverage)
      .map((item) => item.qid)).toEqual(["Q301", "Q302"]);
    const queue = prioritizeReviewQueue([
      getCandidateReviewItem(oneMissing)!,
      getCandidateReviewItem(emptyCell)!,
    ], coverage);
    expect(queue.map((item) => item.qid)).toEqual(["Q302", "Q301"]);
    expect(queue[0].coverageCells).toEqual([{
      region: "제주",
      category: "nature",
      count: 0,
      target: 2,
      deficit: 2,
    }]);
  });

  it("drops coordinates outside South Korea bounds", () => {
    const rows = collectCandidates([{
      item: { value: "http://www.wikidata.org/entity/Q999" },
      itemLabel: { value: "해외 장소" },
      coord: { value: "Point(2.35 48.85)" },
      address: { value: "서울특별시로 잘못 기록된 주소" },
      image: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Test.jpg" },
      category: { value: "urban" },
    }], "서울");
    expect(rows).toEqual([]);
  });
});
