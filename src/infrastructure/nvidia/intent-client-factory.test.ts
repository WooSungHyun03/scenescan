import { describe, expect, it } from "vitest";
import { getNvidiaCallBudget, getNvidiaIntentClient } from "./intent-client-factory";

describe("getNvidiaIntentClient", () => {
  it("returns null when NVIDIA_API_KEY is not configured in this environment (requirement 4)", () => {
    // This test suite never sets NVIDIA_API_KEY/NVIDIA_INTENT_ENABLED --
    // proving the real factory wiring, not just a mocked path, returns
    // null and therefore can never reach a real fetch call.
    expect(getNvidiaIntentClient()).toBeNull();
  });
});

describe("getNvidiaCallBudget", () => {
  it("returns the same shared budget instance across calls", () => {
    expect(getNvidiaCallBudget()).toBe(getNvidiaCallBudget());
  });
});
