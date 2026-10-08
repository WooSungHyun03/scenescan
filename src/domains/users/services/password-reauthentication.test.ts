import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { reauthenticatePassword } from "./password-reauthentication";

function fixture() {
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-a", email: "a@example.test" } }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: "user-a" } }, error: null }),
  };
  return { auth, client: { auth } as unknown as Pick<SupabaseClient, "auth"> };
}

describe("password reauthentication", () => {
  it("uses the freshly verified user's email and requires the same identity", async () => {
    const { auth, client } = fixture();
    expect(await reauthenticatePassword(client, "transient-password")).toBeNull();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@example.test", password: "transient-password" });
  });

  it("rejects the wrong current password", async () => {
    const { auth, client } = fixture();
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: "invalid_credentials" } });
    expect(await reauthenticatePassword(client, "wrong")).toEqual({ code: "invalid_credentials" });
  });

  it("never signs in when the fresh user is absent", async () => {
    const { auth, client } = fixture();
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await reauthenticatePassword(client, "password")).toEqual({ code: "session_not_found" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("fails closed if reauthentication returns a different user", async () => {
    const { auth, client } = fixture();
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "user-b" } }, error: null });
    expect(await reauthenticatePassword(client, "password")).toEqual({ code: "session_not_found" });
  });
});
