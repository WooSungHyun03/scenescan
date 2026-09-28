import { describe, expect, it } from "vitest";
import { resolveLocationListPagination } from "./pagination";

describe("resolveLocationListPagination", () => {
  it("defaults to limit 20, offset 0 when nothing is provided", () => {
    expect(resolveLocationListPagination()).toEqual({ limit: 20, offset: 0 });
    expect(resolveLocationListPagination({})).toEqual({ limit: 20, offset: 0 });
  });

  it("caps an oversized limit at 50", () => {
    expect(resolveLocationListPagination({ limit: 1000 })).toEqual({ limit: 50, offset: 0 });
  });

  it("falls back to the default for a negative, zero, or non-integer limit", () => {
    expect(resolveLocationListPagination({ limit: -5 })).toEqual({ limit: 20, offset: 0 });
    expect(resolveLocationListPagination({ limit: 0 })).toEqual({ limit: 20, offset: 0 });
    expect(resolveLocationListPagination({ limit: 3.5 })).toEqual({ limit: 20, offset: 0 });
  });

  it("falls back to offset 0 for a negative or non-integer offset", () => {
    expect(resolveLocationListPagination({ offset: -1 })).toEqual({ limit: 20, offset: 0 });
    expect(resolveLocationListPagination({ offset: 1.5 })).toEqual({ limit: 20, offset: 0 });
  });

  it("passes through a valid limit/offset combination unchanged", () => {
    expect(resolveLocationListPagination({ limit: 30, offset: 40 })).toEqual({ limit: 30, offset: 40 });
  });
});
