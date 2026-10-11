import { beforeEach, describe, expect, it, vi } from "vitest";
import { NvidiaIntentClient } from "@/infrastructure/nvidia/intent-client";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), search: vi.fn() }));
vi.mock("@/env/server", () => ({ serverEnv: { nvidiaIntent: {
  enabled: true, model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
} } }));
vi.mock("@/infrastructure/nvidia/intent-client-factory", () => ({
  getNvidiaIntentClient: () => new NvidiaIntentClient({ apiKey: "test-only", fetcher: mocks.fetch, maxAttempts: 1 }),
  getNvidiaCallBudget: () => ({ tryConsume: () => true }),
}));
vi.mock("@/domains/locations/server/repository", () => ({ searchByText: mocks.search }));
const { POST } = await import("./route");
const request = (query: string, filters?: unknown) => new Request("http://localhost/api/search/text", {
  method: "POST", body: JSON.stringify({ query, ...(filters ? { filters } : {}) }),
});

beforeEach(() => { mocks.fetch.mockReset(); mocks.search.mockReset(); });

describe("NVIDIA text-search route wiring", () => {
  it.each([
    ["부산에서 바다가 보이는 촬영 장소", null, "바다"],
    ["해운대 근처 야경이 예쁜 곳", "busan_haeundae_gu", "야경"],
    ["오래된 공장 분위기의 장소", null, "공장"],
    ["광안대교가 보이는 장소", null, "광안대교"],
    ["영도에서 분위기 있는 골목", "busan_yeongdo_gu", "골목"],
  ])("retrieves repository results for Korean intent: %s", async (query, district, keyword) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: {
      content: `</think>${JSON.stringify({ district, category: null, keywords: [keyword], unsupportedConditions: [], locations: [{ id: "hallucinated" }] })}`,
    } }] })));
    const registered = { location: { id: "registered-db-id", region: "부산" }, score: 1, matchedOn: [] };
    mocks.search.mockResolvedValue([registered]);
    const response = await POST(request(query));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.intentSource).toBe("nvidia");
    expect(body.results).toEqual([registered]);
    expect(mocks.search.mock.calls[0]?.[0]).toMatchObject({ district, keywords: expect.arrayContaining([keyword]) });
    expect(JSON.stringify(body)).not.toContain("hallucinated");
    expect(JSON.stringify(body)).not.toContain("test-only");
  });

  it("honestly reports provider fallback instead of presenting HTTP 200 as NVIDIA success", async () => {
    mocks.fetch.mockResolvedValue(new Response("upstream secret/body", { status: 503 }));
    mocks.search.mockResolvedValue([]);
    const body = await (await POST(request("야경", { district: "busan_haeundae_gu" }))).json();
    expect(body).toMatchObject({ intentSource: "rules", results: [], notice: { code: "INTENT_UNAVAILABLE" } });
    expect(JSON.stringify(body)).not.toContain("upstream");
    expect(mocks.search.mock.calls[0]?.[0]).toMatchObject({ district: "busan_haeundae_gu" });
  });

  it("shows a genuine empty result after valid model extraction", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"keywords":["가상장소"]}' } }] })));
    mocks.search.mockResolvedValue([]);
    expect(await (await POST(request("가상장소"))).json()).toMatchObject({ intentSource: "nvidia", results: [], notice: null });
  });

  it("rejects an invalid filter before the model and short-circuits non-Busan requests", async () => {
    expect((await POST(request("야경", { district: "seoul" }))).status).toBe(400);
    const body = await (await POST(request("서울 카페"))).json();
    expect(body).toMatchObject({ intentSource: "rules", results: [], notice: { code: "OUT_OF_SCOPE_REGION" } });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
