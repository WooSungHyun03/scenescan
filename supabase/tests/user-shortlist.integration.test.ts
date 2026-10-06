import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSupabaseUserShortlistRepository } from "@/domains/users/server/shortlist-repository";
import { createSupabaseAdminClient, readSupabaseAdminEnvironment } from "../../scripts/shared/supabase-admin-client.ts";
import { getIntegrationEnv } from "./integration-env.ts";

const env = getIntegrationEnv();

describe.skipIf(!env)("user shortlist RLS (live Supabase)", () => {
  const admin = env ? createSupabaseAdminClient(readSupabaseAdminEnvironment(process.env)) : null!;
  const password = `Shortlist-${randomUUID()}!`;
  const emails = [`shortlist-a-${randomUUID()}@example.test`, `shortlist-b-${randomUUID()}@example.test`];
  const userIds: string[] = [];
  const locationIds = [randomUUID(), randomUUID()];
  let clientA: SupabaseClient;
  let clientASecondDevice: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    for (const email of emails) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error ?? new Error("Failed to create shortlist test user");
      userIds.push(data.user.id);
    }
    const { error: locationError } = await admin.from("locations").insert(locationIds.map((id, index) => ({
      id,
      name: `관심 장소 통합 테스트 ${index}`,
      description: "test",
      category: "urban",
      region: "부산",
      address: "부산 테스트 주소",
      latitude: 35.1 + index * 0.001,
      longitude: 129.0,
    })));
    if (locationError) throw locationError;

    const makeClient = () => createClient(env!.url, env!.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    clientA = makeClient();
    clientASecondDevice = makeClient();
    clientB = makeClient();
    for (const [client, email] of [[clientA, emails[0]], [clientASecondDevice, emails[0]], [clientB, emails[1]]] as const) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  });

  afterAll(async () => {
    await admin.from("locations").delete().in("id", locationIds);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  });

  it("isolates two users and exposes saved data on a second device", async () => {
    const repositoryA = createSupabaseUserShortlistRepository(clientA);
    const repositoryB = createSupabaseUserShortlistRepository(clientB);
    await repositoryA.setSaved(userIds[0], locationIds[0], true);
    await repositoryB.setSaved(userIds[1], locationIds[1], true);

    expect(await repositoryA.list(userIds[0])).toEqual([locationIds[0]]);
    expect(await repositoryB.list(userIds[1])).toEqual([locationIds[1]]);
    expect(await createSupabaseUserShortlistRepository(clientASecondDevice).list(userIds[0]))
      .toEqual([locationIds[0]]);
  });

  it("blocks writing another user's owner id at the RLS boundary", async () => {
    const { error } = await clientA.from("user_shortlist").insert({
      user_id: userIds[1],
      location_id: locationIds[0],
    });
    expect(error).not.toBeNull();
  });

  it("merges duplicates idempotently, ignores deleted IDs, and cascades deleted locations", async () => {
    const repository = createSupabaseUserShortlistRepository(clientA);
    const missingId = randomUUID();
    const first = await repository.merge(userIds[0], [locationIds[1], locationIds[1], missingId]);
    expect(first.mergedCount).toBe(1);
    expect(first.ignoredCount).toBe(1);
    const repeated = await repository.merge(userIds[0], [locationIds[1], missingId]);
    expect(repeated.mergedCount).toBe(0);

    await admin.from("locations").delete().eq("id", locationIds[1]);
    expect(await repository.list(userIds[0])).not.toContain(locationIds[1]);
  });
});
