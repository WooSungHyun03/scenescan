import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261006000000_user_shortlist.sql"),
  "utf8",
).toLowerCase();

describe("user shortlist migration", () => {
  it("has compound uniqueness and cascading account/location foreign keys", () => {
    expect(migration).toContain("primary key (user_id, location_id)");
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).toContain("references public.locations(id) on delete cascade");
  });

  it("enables owner-only RLS without granting anon writes", () => {
    expect(migration).toContain("alter table public.user_shortlist enable row level security");
    expect(migration.match(/\(select auth\.uid\(\)\) = user_id/gu)).toHaveLength(3);
    expect(migration).toContain("grant select, insert, delete on table public.user_shortlist to authenticated");
    expect(migration).not.toMatch(/grant[^;]+to anon/iu);
  });
});
