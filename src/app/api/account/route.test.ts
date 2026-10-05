import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dataAccessError, unauthenticatedError } from "@/shared/errors/application-error";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_CSRF_HEADER,
  ACCOUNT_DELETION_CSRF_VALUE,
} from "@/types/contracts";
import { handleDeleteAccount, type AccountRouteDependencies } from "./route";

function request(overrides: {
  origin?: string | null;
  csrf?: string | null;
  body?: unknown;
  fetchSite?: string;
  cookie?: string;
  host?: string;
} = {}): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  const origin = overrides.origin === undefined ? "https://scenescan.example" : overrides.origin;
  const csrf = overrides.csrf === undefined ? ACCOUNT_DELETION_CSRF_VALUE : overrides.csrf;
  if (origin !== null) headers.set("Origin", origin);
  if (csrf !== null) headers.set(ACCOUNT_DELETION_CSRF_HEADER, csrf);
  if (overrides.fetchSite) headers.set("Sec-Fetch-Site", overrides.fetchSite);
  if (overrides.cookie) headers.set("Cookie", overrides.cookie);
  if (overrides.host) headers.set("Host", overrides.host);
  return new NextRequest("https://scenescan.example/api/account", {
    method: "DELETE",
    headers,
    body: JSON.stringify(overrides.body ?? {
      currentPassword: "current-password",
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    }),
  });
}

function dependencies(deleteAccount = vi.fn().mockResolvedValue(undefined)) {
  const authClient = { auth: {} } as SupabaseClient;
  const getAdminClient = vi.fn(() => ({ auth: { admin: {} } }) as unknown as SupabaseClient);
  const createAuthClient = vi.fn(() => authClient);
  return {
    authClient,
    deps: { createAuthClient, getAdminClient, deleteAccount } as AccountRouteDependencies,
    createAuthClient,
    getAdminClient,
    deleteAccount,
  };
}

describe("DELETE /api/account", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requires same-origin Fetch Metadata and the custom CSRF header before auth access", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const invalidRequest of [
      request({ origin: null }),
      request({ origin: "https://evil.example" }),
      request({ csrf: null }),
      request({ fetchSite: "cross-site" }),
    ]) {
      const setup = dependencies();
      const response = await handleDeleteAccount(invalidRequest, setup.deps);
      expect(response.status).toBe(403);
      expect(setup.createAuthClient).not.toHaveBeenCalled();
      expect(setup.deleteAccount).not.toHaveBeenCalled();
    }
  });

  it("uses the public request host when Next normalizes its internal URL origin", async () => {
    const setup = dependencies();
    const response = await handleDeleteAccount(request({
      origin: "https://preview.scenescan.example",
      host: "preview.scenescan.example",
    }), setup.deps);

    expect(response.status).toBe(200);
    expect(setup.deleteAccount).toHaveBeenCalledOnce();
  });

  it("rejects client-selected user ids and incomplete confirmation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setup = dependencies();
    const response = await handleDeleteAccount(request({ body: {
      currentPassword: "current-password",
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      userId: "22222222-2222-4222-8222-222222222222",
    } }), setup.deps);

    expect(response.status).toBe(400);
    expect(setup.createAuthClient).not.toHaveBeenCalled();
    expect(setup.deleteAccount).not.toHaveBeenCalled();
  });

  it("clears only auth cookies and all personal browser storage after confirmed success", async () => {
    const setup = dependencies();
    const response = await handleDeleteAccount(request({
      cookie: "sb-project-auth-token=secret-session; theme=light",
    }), setup.deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(setup.deleteAccount).toHaveBeenCalledWith(
      setup.authClient,
      setup.getAdminClient,
      "current-password",
    );
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("");
    expect(response.cookies.get("theme")).toBeUndefined();
    expect(response.headers.get("Clear-Site-Data")).toBe('"cache", "cookies", "storage"');
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  it("preserves the session, reports failure, and allows a safe retry after admin failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const deleteAccount = vi.fn()
      .mockRejectedValueOnce(dataAccessError("admin failed", new Error("private detail")))
      .mockResolvedValueOnce(undefined);
    const setup = dependencies(deleteAccount);

    const failed = await handleDeleteAccount(request({ cookie: "sb-project-auth-token=session" }), setup.deps);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private detail");
    expect(failed.headers.get("Clear-Site-Data")).toBeNull();
    expect(failed.cookies.get("sb-project-auth-token")).toBeUndefined();

    const retried = await handleDeleteAccount(request({ cookie: "sb-project-auth-token=session" }), setup.deps);
    expect(retried.status).toBe(200);
    expect(deleteAccount).toHaveBeenCalledTimes(2);
  });

  it("denies a stale post-deletion session instead of trusting its JWT", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const deleteAccount = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(unauthenticatedError("deleted user no longer exists"));
    const setup = dependencies(deleteAccount);
    const first = await handleDeleteAccount(request(), setup.deps);
    expect(first.status).toBe(200);

    const staleAccess = await handleDeleteAccount(request(), setup.deps);
    expect(staleAccess.status).toBe(401);
    await expect(staleAccess.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
