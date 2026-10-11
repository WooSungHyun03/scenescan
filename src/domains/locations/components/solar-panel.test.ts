import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SolarPanel } from "./solar-panel";

const props = {
  point: { latitude: 35.1585, longitude: 129.1605 }, shootDate: "2026-06-21", shootTime: "",
  onShootDateChange: () => undefined, onShootTimeChange: () => undefined,
};
describe("SolarPanel daily times", () => {
  it("shows calculated sunrise/sunset once a date is chosen, without requiring a shooting hour", () => {
    const html = renderToStaticMarkup(createElement(SolarPanel, props));
    expect(html).toContain("촬영일 일출·일몰");
    expect(html).toContain("SunCalc 계산값");
    expect(html).not.toContain("NaN");
  });
  it("does not crash or display invented times for an invalid time zone", () => {
    const html = renderToStaticMarkup(createElement(SolarPanel, { ...props, timeZone: "Invalid/Zone" }));
    expect(html).toContain("시간대 확인 불가");
    expect(html).not.toContain("촬영일 일출·일몰");
  });
});
