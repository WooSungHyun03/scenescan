import { describe, expect, it } from "vitest";
import { getMockLocation, getMockLocations, searchMockLocations } from "./mock-repository";

describe("mock location repository", () => {
  it("filters fixtures and returns no more than eight search results", () => {
    expect(getMockLocations()).toHaveLength(10);
    expect(getMockLocations({ region: "부산" }).every((item) => item.region === "부산")).toBe(true);
    expect(getMockLocation("missing")).toBeNull();
    expect(searchMockLocations(Array(512).fill(0))).toHaveLength(8);
  });
});
