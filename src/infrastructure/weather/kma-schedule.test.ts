import { describe, expect, it } from "vitest";

import { getLatestKmaBaseTime, selectWeatherPurpose } from "./kma-schedule";

describe("KMA publication schedule", () => {
  it("uses the previous observation date until the official 40-minute publication delay passes", () => {
    expect(getLatestKmaBaseTime("observation", new Date("2026-10-05T15:39:59Z")))
      .toMatchObject({ baseDate: "20261005", baseTime: "2300" });
    expect(getLatestKmaBaseTime("observation", new Date("2026-10-05T15:40:00Z")))
      .toMatchObject({ baseDate: "20261006", baseTime: "0000" });
  });

  it("respects ultra-short and short forecast publication delays", () => {
    expect(getLatestKmaBaseTime("ultra-short-forecast", new Date("2026-10-06T05:44:59Z")))
      .toMatchObject({ baseTime: "1330" });
    expect(getLatestKmaBaseTime("ultra-short-forecast", new Date("2026-10-06T05:45:00Z")))
      .toMatchObject({ baseTime: "1430" });
    expect(getLatestKmaBaseTime("short-forecast", new Date("2026-10-05T20:09:59Z")))
      .toMatchObject({ baseTime: "0200" });
    expect(getLatestKmaBaseTime("short-forecast", new Date("2026-10-05T20:10:00Z")))
      .toMatchObject({ baseTime: "0500" });
  });

  it("selects a product by observation and forecast coverage", () => {
    const now = new Date("2026-10-06T05:20:00Z");
    expect(selectWeatherPurpose(new Date(now.getTime() - 60 * 60_000), now)).toEqual({ ok: true, purpose: "observation" });
    expect(selectWeatherPurpose(new Date(now.getTime() - 60 * 60_000 - 1), now)).toEqual({ ok: false, reason: "past" });
    expect(selectWeatherPurpose(new Date(now.getTime() + 6 * 60 * 60_000), now)).toEqual({ ok: true, purpose: "ultra-short-forecast" });
    expect(selectWeatherPurpose(new Date(now.getTime() + 6 * 60 * 60_000 + 1), now)).toEqual({ ok: true, purpose: "short-forecast" });
    expect(selectWeatherPurpose(new Date(now.getTime() + 4 * 24 * 60 * 60_000 + 1), now)).toEqual({ ok: false, reason: "future" });
  });
});
