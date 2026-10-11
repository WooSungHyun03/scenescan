import { describe, expect, it } from "vitest";
import { groupLocationsByWeatherGrid } from "./weather-grid-groups";

describe("groupLocationsByWeatherGrid", () => {
  it("uses one representative request for locations in the same KMA grid", () => {
    const result = groupLocationsByWeatherGrid([
      { id: "first", point: { latitude: 35.159, longitude: 129.105 } },
      { id: "second", point: { latitude: 35.1592, longitude: 129.1052 } },
      { id: "third", point: { latitude: 35.24, longitude: 129.2 } },
    ]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toMatchObject({
      representativeLocationId: "first",
      locationIds: ["first", "second"],
    });
    expect(result.gridKeyByLocationId.get("first"))
      .toBe(result.gridKeyByLocationId.get("second"));
  });

  it("keeps invalid coordinates out of provider requests", () => {
    const result = groupLocationsByWeatherGrid([
      { id: "invalid", point: { latitude: Number.NaN, longitude: 129 } },
    ]);

    expect(result.groups).toEqual([]);
    expect(result.unavailableLocationIds).toEqual(new Set(["invalid"]));
  });
});
