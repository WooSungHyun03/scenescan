import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { getSupabaseClient } from "@/infrastructure/supabase/server-client";
import { createSupabaseAdminClient, readSupabaseAdminEnvironment } from "../../scripts/shared/supabase-admin-client.ts";
import { getIntegrationEnv } from "./integration-env.ts";

const env = getIntegrationEnv();

// Moves the manual verification steps from docs/database.md's "RLS
// verification" section (and, for Storage, the report for the migration
// that introduced it) into a reproducible automated test, run against a
// real migrated Supabase instance -- see docs/integration-testing.md.
describe.skipIf(!env)("schema and RLS (live Supabase)", () => {
  const adminClient = env ? createSupabaseAdminClient(readSupabaseAdminEnvironment(process.env)) : null!;

  beforeAll(() => {
    // getSupabaseClient() reads NEXT_PUBLIC_SUPABASE_URL/ANON_KEY from
    // process.env at call time -- already set by whoever ran this suite
    // (see integration-env.ts); nothing to configure here.
  });

  it("all three migrated tables are reachable with the anon (public read) role", async () => {
    const anonClient = getSupabaseClient();
    for (const table of ["locations", "location_images", "parking"] as const) {
      const { error } = await anonClient.from(table).select("id").limit(1);
      expect(error, `anon select on ${table}`).toBeNull();
    }
  });

  it("anon cannot insert a row", async () => {
    const anonClient = getSupabaseClient();
    const { error } = await anonClient.from("locations").insert({
      name: "rls-test", description: "", category: "urban", region: "서울", address: "x", latitude: 0, longitude: 0, source: "manual",
    });
    // INSERT's RLS check is `WITH CHECK`, which rejects the statement
    // outright (unlike UPDATE/DELETE below) -- verified directly: this
    // throws "new row violates row-level security policy", not a silent
    // zero-row success.
    expect(error).not.toBeNull();
  });

  it("anon's update/delete against a real row silently affects zero rows -- the row is provably unchanged, checked via the service role", async () => {
    // Important, non-obvious Postgres/Supabase behavior discovered while
    // writing this test against a real `supabase start` instance (not the
    // ad-hoc Docker+pgvector+PostgREST setups used earlier in this
    // project's history, which manually granted only SELECT to anon and so
    // only ever exercised a *different*, also-safe failure mode --
    // "permission denied for table X" -- that does not represent how real
    // Supabase actually behaves).
    //
    // Supabase's real platform bootstrap grants anon/authenticated ALL
    // table privileges (SELECT/INSERT/UPDATE/DELETE/...) by default and
    // relies entirely on RLS policies to restrict access -- confirmed
    // directly: `select grantee, privilege_type from
    // information_schema.role_table_grants where grantee = 'anon'` lists
    // every DML privilege, not just SELECT. When RLS is enabled and no
    // policy exists for UPDATE/DELETE, Postgres does not raise a
    // permission-denied error for those commands -- it applies an implicit
    // `USING (false)`, so the command runs "successfully" but matches and
    // affects zero rows. (INSERT is different: its `WITH CHECK` clause
    // does reject the statement outright -- see the previous test.) This
    // is still safe, just a different mechanism than a thrown error, and
    // the previously-committed docs/database.md described the wrong one --
    // corrected there in this same change.
    const seedId = randomUUID();
    const { error: seedError } = await adminClient.from("locations").insert({
      id: seedId, name: "RLS 실제 테스트", description: "", category: "urban", region: "서울", address: "주소", latitude: 37.0, longitude: 127.0,
    });
    expect(seedError).toBeNull();

    const anonClient = getSupabaseClient();
    await anonClient.from("locations").update({ name: "HACKED BY ANON" }).eq("id", seedId);
    const afterUpdate = await adminClient.from("locations").select("name").eq("id", seedId).single();
    expect(afterUpdate.data?.name).toBe("RLS 실제 테스트");

    await anonClient.from("locations").delete().eq("id", seedId);
    const afterDelete = await adminClient.from("locations").select("id").eq("id", seedId).maybeSingle();
    expect(afterDelete.data).not.toBeNull();

    await adminClient.from("locations").delete().eq("id", seedId);
  });

  it("match_location_images is executable by anon (security invoker + base grants)", async () => {
    const anonClient = getSupabaseClient();
    const zeroVector = `[${Array(512).fill(0).join(",")}]`;
    const { error } = await anonClient.rpc("match_location_images", {
      query_embedding: zeroVector,
      match_threshold: 0,
      match_count: 1,
      expected_embedding_model: "any",
    });
    expect(error).toBeNull();
  });

  describe("location-images Storage bucket", () => {
    const objectName = `rls-test-${randomUUID()}.jpg`;

    it("anon cannot upload an object (bucket write RLS)", async () => {
      const anonClient = getSupabaseClient();
      const { error } = await anonClient.storage.from("location-images").upload(objectName, new Blob(["fake"], { type: "image/jpeg" }));
      expect(error).not.toBeNull();
    });

    it("the service role can upload, and the object is then publicly readable by anon", async () => {
      const { error: uploadError } = await adminClient.storage
        .from("location-images")
        .upload(objectName, new Blob(["fake"], { type: "image/jpeg" }), { contentType: "image/jpeg" });
      expect(uploadError).toBeNull();

      const anonClient = getSupabaseClient();
      const { data } = anonClient.storage.from("location-images").getPublicUrl(objectName);
      const response = await fetch(data.publicUrl);
      expect(response.status).toBe(200);

      await adminClient.storage.from("location-images").remove([objectName]);
    });
  });
});
