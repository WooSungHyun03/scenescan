import { describe, expect, it } from "vitest";
import { getWeatherTargetInstant } from "./shooting-conditions-panel";

describe("shooting conditions weather target", () => {
  it("uses current weather only while both inputs are empty", () => {
    expect(getWeatherTargetInstant("", "")).toBeNull();
    expect(getWeatherTargetInstant("2026-10-12", "")).toBeUndefined();
    expect(getWeatherTargetInstant("", "12:30")).toBeUndefined();
  });

  it("converts the shared Korean wall-clock input to one absolute instant", () => {
    expect(getWeatherTargetInstant("2026-10-12", "12:30"))
      .toBe("2026-10-12T03:30:00.000Z");
  });

  it("does not request weather for invalid calendar input", () => {
    expect(getWeatherTargetInstant("2026-02-30", "12:30")).toBeUndefined();
    expect(getWeatherTargetInstant("2026-10-12", "24:00")).toBeUndefined();
  });
});
