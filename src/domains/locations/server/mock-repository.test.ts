import { describe, expect, it } from "vitest";
import { getMockLocation, getMockLocations, getMockSimilarLocations, searchMockLocations } from "./mock-repository";

describe("mock location repository", () => {
  it("filters fixtures and returns no more than eight search results", () => {
    expect(getMockLocations()).toHaveLength(10);
    expect(getMockLocations({ region: "부산" }).every((item) => item.region === "부산")).toBe(true);
    expect(getMockLocation("missing")).toBeNull();
    expect(searchMockLocations(Array(512).fill(0))).toHaveLength(8);
  });

  it("returns deterministic same-category recommendations without the selected location", () => {
    const results = getMockSimilarLocations("demo-01");
    expect(results.map((result) => result.location.id)).toEqual(["demo-07"]);
    expect(results.every((result) => result.location.id !== "demo-01")).toBe(true);
    expect(getMockSimilarLocations("missing")).toEqual([]);
  });

  it("distinguishes on-site parking from nearby parking fixtures", () => {
    const onSite = getMockLocation("demo-01");
    const nearby = getMockLocation("demo-02");

    expect(onSite?.parking[0].locationId).toBe(onSite?.id);
    expect(onSite?.parking[0].point).toEqual(onSite?.point);
    expect(nearby?.parking[0].locationId).toBeNull();
    expect(nearby?.parking[0].point).not.toEqual(nearby?.point);
  });
});
