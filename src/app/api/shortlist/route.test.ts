import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UserShortlistRepository } from "@/domains/users/server/shortlist-repository";
import { dataAccessError } from "@/shared/errors/application-error";
import {
  SHORTLIST_WRITE_CSRF_HEADER,
  SHORTLIST_WRITE_CSRF_VALUE,
} from "@/types/contracts";
import {
  handleGetShortlist,
  handlePostShortlist,
  handlePutShortlist,
  type ShortlistRouteDependencies,
} from "./route";

const locationA = "00000000-0000-4000-8000-000000000003";
const locationB = "00000000-0000-4000-8000-000000000007";
const deletedLocation = "00000000-0000-4000-8000-000000000099";
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

function request(method: "GET" | "PUT" | "POST", body?: unknown, options: {
  origin?: string | null;
  csrf?: string | null;
} = {}) {
  const headers = new Headers();
  if (method !== "GET") {
    headers.set("Content-Type", "application/json");
    const origin = options.origin === undefined ? "https://scenescan.example" : options.origin;
    const csrf = options.csrf === undefined ? SHORTLIST_WRITE_CSRF_VALUE : options.csrf;
    if (origin !== null) headers.set("Origin", origin);
    if (csrf !== null) headers.set(SHORTLIST_WRITE_CSRF_HEADER, csrf);
  }
  return new NextRequest("https://scenescan.example/api/shortlist", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function memoryRepository(validIds = new Set([locationA, locationB])): UserShortlistRepository & {
  values: Map<string, Set<string>>;
} {
  const values = new Map<string, Set<string>>();
  const list = async (userId: string) => [...(values.get(userId) ?? new Set<string>())];
  return {
    values,
    list,
    async setSaved(userId, locationId, saved) {
      const ids = values.get(userId) ?? new Set<string>();
      values.set(userId, ids);
      if (saved && validIds.has(locationId)) ids.add(locationId);
      if (!saved) ids.delete(locationId);
      return list(userId);
    },
    async merge(userId, locationIds) {
      const before = new Set(await list(userId));
      const ids = values.get(userId) ?? new Set<string>();
      values.set(userId, ids);
      const candidates = [...new Set(locationIds)];
      const valid = candidates.filter((id) => validIds.has(id));
      valid.forEach((id) => ids.add(id));
      return {
        ids: await list(userId),
        mergedCount: valid.filter((id) => !before.has(id)).length,
        ignoredCount: candidates.length - valid.length,
      };
    },
  };
}

function dependencies(repository: UserShortlistRepository, userId: string | null): ShortlistRouteDependencies {
  return {
    createAuthClient: vi.fn(() => ({} as SupabaseClient)),
    verifyUser: vi.fn(async () => userId ? ({ id: userId } as User) : null),
    createRepository: vi.fn(() => repository),
  };
}

describe("/api/shortlist", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps two authenticated accounts isolated and never accepts a user selector", async () => {
    const repository = memoryRepository();
    repository.values.set(userA, new Set([locationA]));
    repository.values.set(userB, new Set([locationB]));

    const first = await handleGetShortlist(request("GET"), dependencies(repository, userA));
    const second = await handleGetShortlist(request("GET"), dependencies(repository, userB));
    await expect(first.json()).resolves.toEqual({ ids: [locationA] });
    await expect(second.json()).resolves.toEqual({ ids: [locationB] });

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const injected = await handlePutShortlist(request("PUT", {
      locationId: locationB,
      saved: true,
      userId: userB,
    }), dependencies(repository, userA));
    expect(injected.status).toBe(400);
    expect(repository.values.get(userA)).toEqual(new Set([locationA]));
  });

  it("requires a fresh user and private no-store responses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handleGetShortlist(request("GET"), dependencies(memoryRepository(), null));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });

  it("rejects missing or cross-origin CSRF metadata before repository access", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository = memoryRepository();
    const setSaved = vi.spyOn(repository, "setSaved");
    for (const invalid of [
      request("PUT", { locationId: locationA, saved: true }, { origin: null }),
      request("PUT", { locationId: locationA, saved: true }, { origin: "https://evil.example" }),
      request("PUT", { locationId: locationA, saved: true }, { csrf: null }),
    ]) {
      const response = await handlePutShortlist(invalid, dependencies(repository, userA));
      expect(response.status).toBe(403);
    }
    expect(setSaved).not.toHaveBeenCalled();
  });

  it("merges valid existing locations idempotently and skips deleted ids", async () => {
    const repository = memoryRepository();
    const deps = dependencies(repository, userA);
    const payload = { locationIds: [locationA, locationA, deletedLocation] };

    const first = await handlePostShortlist(request("POST", payload), deps);
    await expect(first.json()).resolves.toEqual({ ids: [locationA], mergedCount: 1, ignoredCount: 1 });
    const repeated = await handlePostShortlist(request("POST", payload), deps);
    await expect(repeated.json()).resolves.toEqual({ ids: [locationA], mergedCount: 0, ignoredCount: 1 });
  });

  it("preserves the previous list on failure and succeeds on retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository = memoryRepository();
    repository.values.set(userA, new Set([locationA]));
    const original = repository.setSaved;
    repository.setSaved = vi.fn()
      .mockRejectedValueOnce(dataAccessError("write failed", new Error("db unavailable")))
      .mockImplementation(original);
    const deps = dependencies(repository, userA);

    const failed = await handlePutShortlist(request("PUT", { locationId: locationB, saved: true }), deps);
    expect(failed.status).toBe(503);
    expect(repository.values.get(userA)).toEqual(new Set([locationA]));
    const retried = await handlePutShortlist(request("PUT", { locationId: locationB, saved: true }), deps);
    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toEqual({ ids: [locationA, locationB] });
  });

  it("returns the same account data to another device request", async () => {
    const repository = memoryRepository();
    const deps = dependencies(repository, userA);
    await handlePutShortlist(request("PUT", { locationId: locationA, saved: true }), deps);

    const secondDevice = await handleGetShortlist(request("GET"), dependencies(repository, userA));
    await expect(secondDevice.json()).resolves.toEqual({ ids: [locationA] });
  });
});
