import { describe, expect, it } from "vitest";
import { parseCoverageArgs } from "./report-coverage.ts";
import { createCoverageReport } from "./coverage.ts";

describe("location coverage report", () => {
  it("reports every region-category cell and its deterministic deficit", () => {
    const report = createCoverageReport([
      { region: "서울", category: "urban" },
      { region: "서울", category: "urban" },
      { region: "부산", category: "nature" },
    ], 2);

    expect(report).toMatchObject({
      targetMinimumPerCell: 2,
      targetMinimumLocations: 136,
      totalLocations: 3,
      summary: {
        totalCells: 68,
        cellsMeetingTarget: 1,
        underTargetCells: 67,
        emptyCells: 66,
      },
    });
    expect(report.cells.find((cell) => cell.region === "서울" && cell.category === "urban"))
      .toMatchObject({ count: 2, deficit: 0, meetsTarget: true });
    expect(report.cells.find((cell) => cell.region === "부산" && cell.category === "nature"))
      .toMatchObject({ count: 1, deficit: 1, meetsTarget: false });
  });

  it("rejects invalid coverage targets", () => {
    expect(() => createCoverageReport([], 0)).toThrow("positive integer");
    expect(() => parseCoverageArgs(["manifest.json", "--output"])).toThrow("requires a path");
    expect(() => parseCoverageArgs(["manifest.json", "--target", "0"])).toThrow("between 1 and 20");
  });
});
