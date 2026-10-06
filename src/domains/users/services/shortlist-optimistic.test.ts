import { describe, expect, it } from "vitest";

import { commitShortlistMutation } from "./shortlist-optimistic";

describe("account shortlist optimistic mutation", () => {
  it("commits the authoritative server result", async () => {
    await expect(commitShortlistMutation(["before"], async () => ["after"]))
      .resolves.toEqual({ ids: ["after"], committed: true, error: null });
  });

  it("rolls back to the previous ids when persistence fails", async () => {
    const failure = new Error("database unavailable");
    const result = await commitShortlistMutation(["kept"], async () => { throw failure; });

    expect(result.ids).toEqual(["kept"]);
    expect(result.committed).toBe(false);
    expect(result.error).toBe(failure);
  });
});
