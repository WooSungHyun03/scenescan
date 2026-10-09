import { describe, expect, it } from "vitest";
import { NvidiaCallBudget } from "./intent-budget";

describe("NvidiaCallBudget", () => {
  it("allows calls up to the per-minute cap and rejects the next one in the same minute", () => {
    const now = new Date("2026-10-09T03:00:00Z");
    const budget = new NvidiaCallBudget({ maxCallsPerMinute: 2, maxCallsPerDay: 100, now: () => now });
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
  });

  it("resets the per-minute count once the clock moves to a new minute", () => {
    let now = new Date("2026-10-09T03:00:00Z");
    const budget = new NvidiaCallBudget({ maxCallsPerMinute: 1, maxCallsPerDay: 100, now: () => now });
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
    now = new Date("2026-10-09T03:01:00Z");
    expect(budget.tryConsume()).toBe(true);
  });

  it("enforces the daily cap across many minutes", () => {
    let now = new Date("2026-10-09T03:00:00Z");
    const budget = new NvidiaCallBudget({ maxCallsPerMinute: 10, maxCallsPerDay: 2, now: () => now });
    expect(budget.tryConsume()).toBe(true);
    now = new Date("2026-10-09T03:01:00Z");
    expect(budget.tryConsume()).toBe(true);
    now = new Date("2026-10-09T03:02:00Z");
    expect(budget.tryConsume()).toBe(false);
  });

  it("resets the daily count once the clock moves to a new UTC day", () => {
    let now = new Date("2026-10-09T23:59:00Z");
    const budget = new NvidiaCallBudget({ maxCallsPerMinute: 10, maxCallsPerDay: 1, now: () => now });
    expect(budget.tryConsume()).toBe(true);
    now = new Date("2026-10-10T00:01:00Z");
    expect(budget.tryConsume()).toBe(true);
  });

  it("uses the documented default caps when no options are given", () => {
    const budget = new NvidiaCallBudget();
    for (let i = 0; i < 10; i += 1) expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
  });
});
