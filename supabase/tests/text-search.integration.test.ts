import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getSupabaseClient } from "@/infrastructure/supabase/server-client";
import { createSupabaseAdminClient, readSupabaseAdminEnvironment } from "../../scripts/shared/supabase-admin-client.ts";
import { getIntegrationEnv } from "./integration-env.ts";

const env = getIntegrationEnv();

// search_locations_by_text / escape_ilike_pattern (see
// supabase/migrations/20261009000000_text_search.sql and
// docs/api-contracts.md's text-search contract) against a real migrated
// Supabase instance.
describe.skipIf(!env)("search_locations_by_text (live Supabase)", () => {
  const adminClient = env ? createSupabaseAdminClient(readSupabaseAdminEnvironment(process.env)) : null!;
  const createdLocationIds: string[] = [];

  afterEach(async () => {
    while (createdLocationIds.length > 0) {
      const id = createdLocationIds.pop()!;
      await adminClient.from("locations").delete().eq("id", id);
    }
  });

  async function seedLocation(overrides: Partial<{
    name: string; description: string; category: string; district: string | null;
    aliases: string[]; tags: string[];
  }> = {}) {
    const id = randomUUID();
    const { error } = await adminClient.from("locations").insert({
      id,
      name: overrides.name ?? `텍스트 검색 테스트 ${id.slice(0, 8)}`,
      description: overrides.description ?? "",
      category: overrides.category ?? "urban",
      region: "부산",
      district: overrides.district ?? null,
      aliases: overrides.aliases ?? [],
      tags: overrides.tags ?? [],
      address: "주소", latitude: 35.1, longitude: 129.0,
    });
    if (error) throw error;
    createdLocationIds.push(id);
    return id;
  }

  it("matches a keyword against name/description/alias/tag and is executable by anon (security invoker + base grants)", async () => {
    const nameHit = await seedLocation({ name: "유니크네임마커 카페" });
    const descriptionHit = await seedLocation({ description: "유니크설명마커가 있는 공간입니다." });
    const aliasHit = await seedLocation({ aliases: ["유니크별칭마커"] });
    const tagHit = await seedLocation({ tags: ["유니크태그마커"] });
    const noHit = await seedLocation({ name: "관련없는 장소" });

    const anonClient = getSupabaseClient();
    for (const [keyword, expectedId] of [
      ["유니크네임마커", nameHit],
      ["유니크설명마커", descriptionHit],
      ["유니크별칭마커", aliasHit],
      ["유니크태그마커", tagHit],
    ] as const) {
      const { data, error } = await anonClient.rpc("search_locations_by_text", {
        keywords: [keyword], filter_region: "부산", match_count: 8,
      });
      expect(error).toBeNull();
      const ids = (data as Array<{ location_id: string }>).map((row) => row.location_id);
      expect(ids).toContain(expectedId);
      expect(ids).not.toContain(noHit);
    }
  });

  it("escapes ILIKE metacharacters so a literal %, _, and \\ in a keyword are not treated as wildcards", async () => {
    const percentLiteral = await seedLocation({ tags: ["50% 할인"] });
    const percentDecoy = await seedLocation({ tags: ["50X 할인"] }); // would match "50%" as a wildcard pattern if unescaped
    const underscoreLiteral = await seedLocation({ tags: ["90_old"] });
    const underscoreDecoy = await seedLocation({ tags: ["90Xold"] }); // would match "90_old" as a wildcard pattern if unescaped

    const anonClient = getSupabaseClient();
    const percentResult = await anonClient.rpc("search_locations_by_text", {
      keywords: ["50% 할인"], filter_region: "부산", match_count: 8,
    });
    expect(percentResult.error).toBeNull();
    const percentIds = (percentResult.data as Array<{ location_id: string }>).map((row) => row.location_id);
    expect(percentIds).toContain(percentLiteral);
    expect(percentIds).not.toContain(percentDecoy);

    const underscoreResult = await anonClient.rpc("search_locations_by_text", {
      keywords: ["90_old"], filter_region: "부산", match_count: 8,
    });
    expect(underscoreResult.error).toBeNull();
    const underscoreIds = (underscoreResult.data as Array<{ location_id: string }>).map((row) => row.location_id);
    expect(underscoreIds).toContain(underscoreLiteral);
    expect(underscoreIds).not.toContain(underscoreDecoy);
  });

  it("filter_district/filter_category apply before LIMIT -- a lower-scoring in-scope row is not starved by a dominant out-of-scope cluster", async () => {
    const uniqueTag = `전용태그${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 5; i += 1) {
      await seedLocation({ district: "busan_jung_gu", tags: [uniqueTag] });
    }
    const eligibleId = await seedLocation({ district: "busan_haeundae_gu", tags: [uniqueTag] });

    const anonClient = getSupabaseClient();
    const { data, error } = await anonClient.rpc("search_locations_by_text", {
      keywords: [uniqueTag], filter_region: "부산", filter_district: "busan_haeundae_gu", match_count: 3,
    });
    expect(error).toBeNull();
    const ids = (data as Array<{ location_id: string }>).map((row) => row.location_id);
    expect(ids).toEqual([eligibleId]);
  });

  it("an empty keywords array matches every row in scope rather than zero rows", async () => {
    const uniqueDescription = `빈키워드테스트${randomUUID().slice(0, 8)}`;
    const id = await seedLocation({ description: uniqueDescription, district: "busan_gijang_gun" });

    const anonClient = getSupabaseClient();
    const { data, error } = await anonClient.rpc("search_locations_by_text", {
      keywords: [], filter_region: "부산", filter_district: "busan_gijang_gun", match_count: 8,
    });
    expect(error).toBeNull();
    expect((data as Array<{ location_id: string; score: number }>).some((row) => row.location_id === id && row.score === 0)).toBe(true);
  });

  it("orders deterministically by score descending, then location_id ascending", async () => {
    const sharedTag = `정렬테스트${randomUUID().slice(0, 8)}`;
    const otherTag = `보조태그${randomUUID().slice(0, 8)}`;
    const highScore = await seedLocation({ tags: [sharedTag, otherTag] });
    const lowScore = await seedLocation({ tags: [sharedTag] });

    const anonClient = getSupabaseClient();
    const { data, error } = await anonClient.rpc("search_locations_by_text", {
      keywords: [sharedTag, otherTag], filter_region: "부산", match_count: 8,
    });
    expect(error).toBeNull();
    const rows = data as Array<{ location_id: string; score: number }>;
    const highRow = rows.find((row) => row.location_id === highScore);
    const lowRow = rows.find((row) => row.location_id === lowScore);
    expect(highRow?.score).toBe(2);
    expect(lowRow?.score).toBe(1);
    expect(rows.indexOf(highRow!)).toBeLessThan(rows.indexOf(lowRow!));
  });
});
