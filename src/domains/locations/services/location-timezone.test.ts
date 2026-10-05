import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LOCATION_TIME_ZONE,
  formatInstantInTimeZone,
  formatTimeZoneWithOffset,
  formatUtcOffset,
  locationDateTimeToInstant,
  resolveLocationTimeZone,
} from "./location-timezone";
import { getSolarPositionAtLocationTime } from "./solar-position";

const originalSystemTimeZone = process.env.TZ;

afterEach(() => {
  if (originalSystemTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalSystemTimeZone;
});

describe("locationDateTimeToInstant", () => {
  it("converts Korean shooting time to UTC without reading the system time zone", () => {
    const results = ["UTC", "America/New_York", "Asia/Seoul"].map((systemTimeZone) => {
      process.env.TZ = systemTimeZone;
      const result = locationDateTimeToInstant({
        date: "2026-06-21",
        time: "12:00",
        timeZone: "Asia/Seoul",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.code);
      return result.instant.toISOString();
    });

    expect(results).toEqual([
      "2026-06-21T03:00:00.000Z",
      "2026-06-21T03:00:00.000Z",
      "2026-06-21T03:00:00.000Z",
    ]);
  });

  it("keeps midnight on the location date while crossing the UTC date boundary", () => {
    const result = locationDateTimeToInstant({
      date: "2026-01-01",
      time: "00:00",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.instant.toISOString()).toBe("2025-12-31T15:00:00.000Z");
    expect(result.offsetMinutes).toBe(540);
  });

  it.each([
    ["2026-02-29", "12:00", "INVALID_DATE"],
    ["2026-02-28", "24:00", "INVALID_TIME"],
    ["not-a-date", "12:00", "INVALID_DATE"],
  ] as const)("rejects invalid wall time %s %s", (date, time, code) => {
    expect(locationDateTimeToInstant({ date, time })).toEqual({
      ok: false,
      code,
      timeZone: DEFAULT_LOCATION_TIME_ZONE,
    });
  });

  it("rejects a DST spring-forward time that never existed", () => {
    expect(
      locationDateTimeToInstant({
        date: "2026-03-08",
        time: "02:30",
        timeZone: "America/New_York",
      }),
    ).toEqual({
      ok: false,
      code: "NONEXISTENT_LOCAL_TIME",
      timeZone: "America/New_York",
    });
  });

  it("selects the earlier instant for a repeated DST fall-back time", () => {
    const result = locationDateTimeToInstant({
      date: "2026-11-01",
      time: "01:30",
      timeZone: "America/New_York",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.instant.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(result.isAmbiguous).toBe(true);
    expect(result.offsetMinutes).toBe(-240);
  });

  it("rejects an unsupported IANA time zone", () => {
    expect(
      locationDateTimeToInstant({
        date: "2026-06-21",
        time: "12:00",
        timeZone: "Mars/Olympus_Mons",
      }),
    ).toEqual({
      ok: false,
      code: "INVALID_TIME_ZONE",
      timeZone: "Mars/Olympus_Mons",
    });
  });
});

describe("location time-zone presentation", () => {
  it("formats the applied IANA zone and offset explicitly", () => {
    const instant = new Date("2026-06-21T03:00:00.000Z");
    expect(formatUtcOffset(540)).toBe("UTC+09:00");
    expect(formatUtcOffset(-270)).toBe("UTC-04:30");
    expect(formatTimeZoneWithOffset("Asia/Seoul", instant)).toBe(
      "Asia/Seoul (UTC+09:00)",
    );
    expect(formatInstantInTimeZone(instant, "Asia/Seoul")).toContain("2026");
  });

  it("uses Korea as the current contract default and accepts a future override", () => {
    expect(resolveLocationTimeZone()).toBe("Asia/Seoul");
    expect(resolveLocationTimeZone("Europe/Paris")).toBe("Europe/Paris");
  });
});

describe("getSolarPositionAtLocationTime", () => {
  it("returns the same sun and light input under different system time zones", () => {
    const results = ["UTC", "America/New_York", "Asia/Seoul"].map((systemTimeZone) => {
      process.env.TZ = systemTimeZone;
      return getSolarPositionAtLocationTime(
        { latitude: 37.5665, longitude: 126.978 },
        { date: "2026-06-21", time: "12:00" },
      );
    });

    for (const result of results) expect(result.ok).toBe(true);
    const readyResults = results.filter((result) => result.ok);
    expect(readyResults.map((result) => result.instant.toISOString())).toEqual([
      "2026-06-21T03:00:00.000Z",
      "2026-06-21T03:00:00.000Z",
      "2026-06-21T03:00:00.000Z",
    ]);
    expect(readyResults[1].position).toEqual(readyResults[0].position);
    expect(readyResults[2].position).toEqual(readyResults[0].position);
  });
});
