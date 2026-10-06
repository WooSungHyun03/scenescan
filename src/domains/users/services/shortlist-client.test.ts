import { describe, expect, it, vi } from "vitest";

import {
  loadAccountShortlist,
  mergeBrowserShortlist,
  setAccountShortlistLocation,
  ShortlistClientError,
} from "./shortlist-client";

const locationId = "00000000-0000-4000-8000-000000000003";

describe("shortlist client", () => {
  it("uses desired-state writes without sending a user id", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(String(init?.body))).toEqual({ locationId, saved: true });
      expect(String(init?.body)).not.toContain("userId");
      expect(new Headers(init?.headers).get("x-scenescan-csrf")).toBe("shortlist-write-v1");
      return Response.json({ ids: [locationId] });
    }) as typeof fetch;

    await expect(setAccountShortlistLocation(locationId, true, fetcher)).resolves.toEqual({ ids: [locationId] });
  });

  it("loads account ids and validates merge responses", async () => {
    const loadFetcher = vi.fn(async () => Response.json({ ids: [locationId] })) as typeof fetch;
    await expect(loadAccountShortlist(loadFetcher)).resolves.toEqual({ ids: [locationId] });

    const mergeFetcher = vi.fn(async () => Response.json({ ids: [locationId], mergedCount: 1, ignoredCount: 0 })) as typeof fetch;
    await expect(mergeBrowserShortlist([locationId], mergeFetcher)).resolves.toEqual({
      ids: [locationId], mergedCount: 1, ignoredCount: 0,
    });
  });

  it("does not treat a failed response as saved", async () => {
    const fetcher = vi.fn(async () => Response.json(
      { error: { code: "DATA_UNAVAILABLE", message: "잠시 후 다시 시도해 주세요." } },
      { status: 503 },
    )) as typeof fetch;

    await expect(setAccountShortlistLocation(locationId, true, fetcher)).rejects.toEqual(
      expect.objectContaining<Partial<ShortlistClientError>>({ status: 503 }),
    );
  });
});
