import { describe, expect, it } from "vitest";
import { parseShootingTime } from "./shooting-time";

describe("Korean shooting time", () => {
  it("is independent of the device timezone", () => {
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "America/New_York", "Asia/Seoul"]) {
        process.env.TZ = zone;
        expect(parseShootingTime("2026-10-04", "00:00")?.toISOString()).toBe("2026-10-03T15:00:00.000Z");
        expect(parseShootingTime("2026-10-04", "16:00")?.toISOString()).toBe("2026-10-04T07:00:00.000Z");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
  it("rejects invalid calendar dates and times", () => {
    for (const [date, time] of [["2026-02-30", "12:00"], ["2026-01-01", "24:00"], ["", ""], ["2026-02-29", "12:00"]]) {
      expect(parseShootingTime(date, time)).toBeNull();
    }
    expect(parseShootingTime("2028-02-29", "23:59")).not.toBeNull();
  });
});
