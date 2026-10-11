import { describe, expect, it, vi } from "vitest";
import { NvidiaIntentClient, NvidiaIntentError } from "./intent-client";
import { NvidiaCallBudget } from "./intent-budget";

function chatResponse(content: unknown, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(overrides: Partial<ConstructorParameters<typeof NvidiaIntentClient>[0]> = {}) {
  const fetcher = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  const sleep = vi.fn<(milliseconds: number) => Promise<void>>(async () => {});
  return {
    fetcher,
    sleep,
    client: new NvidiaIntentClient({
      apiKey: "fake-test-key",
      fetcher: fetcher as unknown as typeof fetch,
      sleep,
      maxAttempts: 3,
      retryBaseDelayMilliseconds: 10,
      ...overrides,
    }),
  };
}

describe("NvidiaIntentClient", () => {
  it("uses the specified hosted Nemotron model with a bounded final-answer budget", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(chatResponse({ district: null, category: null, keywords: ["바다"], unsupportedConditions: [] }));
    await setup.client.extractIntent("부산에서 바다가 보이는 촬영 장소");
    expect(setup.fetcher.mock.calls[0]?.[0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    const body = JSON.parse(String(setup.fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", max_tokens: 1024,
      stream: false, reasoning_budget: 0, chat_template_kwargs: { enable_thinking: false } });
  });

  it.each(["</think>{\"keywords\":[\"바다\"]}", "```json\n{\"keywords\":[\"바다\"]}\n```", "</think>\n```json\n{\"keywords\":[\"바다\"]}\n```"])("parses only final JSON with a supported envelope: %s", async (content) => {
    const setup = client();
    setup.fetcher.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, reasoning_content: "Not a search answer" } }] })));
    await expect(setup.client.extractIntent("바다")).resolves.toMatchObject({ keywords: ["바다"] });
  });

  it.each(["", "   ", "<think>{\"keywords\":[\"wrong\"]}</think>{\"keywords\":[\"바다\"]}", "Answer: {\"keywords\":[\"바다\"]}"])("rejects empty/prose/reasoning content without treating reasoning as results: %s", async (content) => {
    const setup = client();
    setup.fetcher.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content, reasoning_content: '{"keywords":["바다"]}' } }] })));
    await expect(setup.client.extractIntent("바다")).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    expect(setup.fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects truncated JSON even when the truncated content happens to parse", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{}' } }] })));
    await expect(setup.client.extractIntent("바다")).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it.each([401, 403, 404, 422])("preserves safe upstream status %s without exposing its error body", async (status) => {
    const setup = client();
    setup.fetcher.mockResolvedValue(new Response("secret echoed by upstream", { status }));
    await expect(setup.client.extractIntent("바다")).rejects.toMatchObject({ code: "REJECTED", httpStatus: status });
    expect(setup.fetcher).toHaveBeenCalledTimes(1);
  });
  it("charges every retry and stops before fetch when the shared budget is exhausted", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(new Response("", { status: 429 }));
    const budget = new NvidiaCallBudget({ maxCallsPerMinute: 1, maxCallsPerDay: 1 });
    await expect(setup.client.extractIntent("해운대", { tryConsume: () => budget.tryConsume() }))
      .rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
    expect(setup.fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries a response-body timeout instead of treating it as malformed JSON", async () => {
    const setup = client({ timeoutMilliseconds: 5 });
    setup.fetcher.mockImplementationOnce(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      },
    }))).mockResolvedValueOnce(chatResponse({ district: null, category: null, keywords: [], unsupportedConditions: [] }));
    await expect(setup.client.extractIntent("해운대")).resolves.toMatchObject({ keywords: [] });
    expect(setup.fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares the budget across concurrent searches and their retries", async () => {
    const setup = client();
    setup.fetcher.mockImplementation(async () => new Response("", { status: 503 }));
    const budget = new NvidiaCallBudget({ maxCallsPerMinute: 2, maxCallsPerDay: 2 });
    const options = { tryConsume: () => budget.tryConsume() };
    const results = await Promise.allSettled([
      setup.client.extractIntent("해운대", options),
      setup.client.extractIntent("광안리", options),
      setup.client.extractIntent("태종대", options),
    ]);
    expect(setup.fetcher).toHaveBeenCalledTimes(2);
    for (const result of results) {
      expect(result).toMatchObject({ status: "rejected", reason: { code: "BUDGET_EXHAUSTED" } });
    }
  });

  it("allows a successful retry while charging two reservations", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(chatResponse({ district: null, category: null, keywords: [], unsupportedConditions: [] }));
    const budget = new NvidiaCallBudget({ maxCallsPerMinute: 2, maxCallsPerDay: 2 });
    const tryConsume = vi.fn(() => budget.tryConsume());
    await expect(setup.client.extractIntent("해운대", { tryConsume })).resolves.toMatchObject({ keywords: [] });
    expect(tryConsume).toHaveBeenCalledTimes(2);
    expect(budget.tryConsume()).toBe(false);
  });

  it("does not reserve quota without credentials", async () => {
    const setup = client({ apiKey: undefined });
    const tryConsume = vi.fn(() => true);
    await expect(setup.client.extractIntent("해운대", { tryConsume })).rejects.toMatchObject({ code: "CONFIGURATION" });
    expect(tryConsume).not.toHaveBeenCalled();
  });

  it("does not retry malformed HTTP JSON when the response has not timed out", async () => {
    const setup = client();
    setup.fetcher.mockImplementation(async () => new Response("{invalid"));
    await expect(setup.client.extractIntent("해운대")).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    expect(setup.fetcher).toHaveBeenCalledTimes(1);
  });

  it("extracts a valid structured intent from a well-formed response", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(chatResponse({ district: "busan_haeundae_gu", category: "urban", keywords: ["야경"], unsupportedConditions: [] }));
    const result = await setup.client.extractIntent("해운대 야경");
    expect(result).toEqual({ district: "busan_haeundae_gu", category: "urban", keywords: ["야경"], unsupportedConditions: [] });
    expect(setup.fetcher).toHaveBeenCalledTimes(1);
  });

  it("never calls fetch without an API key, and throws CONFIGURATION", async () => {
    const setup = client({ apiKey: undefined });
    await expect(setup.client.extractIntent("해운대")).rejects.toMatchObject({ code: "CONFIGURATION" });
    expect(setup.fetcher).not.toHaveBeenCalled();
  });

  it("rejects a model outside the allowlist at construction time", () => {
    expect(() => new NvidiaIntentClient({ apiKey: "key", model: "not-an-allowed-model" as never }))
      .toThrow(/allowlist/);
  });

  it("treats malformed JSON in the message content as non-retryable and falls through immediately", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "{not valid json" } }] }), { status: 200 }),
    );
    await expect(setup.client.extractIntent("해운대")).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    expect(setup.fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats a disallowed district in an otherwise well-formed response as INVALID_RESULT, non-retryable", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(chatResponse({ district: "서울", category: null, keywords: [], unsupportedConditions: [] }));
    await expect(setup.client.extractIntent("서울 느낌 나는 해운대")).rejects.toMatchObject({ code: "INVALID_RESULT" });
    expect(setup.fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 with exponential backoff up to the configured attempt limit, then gives up", async () => {
    const setup = client({ maxAttempts: 3 });
    setup.fetcher.mockResolvedValue(new Response("", { status: 429 }));
    await expect(setup.client.extractIntent("해운대")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(setup.fetcher).toHaveBeenCalledTimes(3);
    expect(setup.sleep).toHaveBeenCalledTimes(2);
    expect(setup.sleep.mock.calls[0]?.[0]).toBe(10);
    expect(setup.sleep.mock.calls[1]?.[0]).toBe(20);
  });

  it("recovers after a transient 429 followed by a successful retry", async () => {
    const setup = client();
    setup.fetcher
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(chatResponse({ district: null, category: null, keywords: ["해운대"], unsupportedConditions: [] }));
    const result = await setup.client.extractIntent("해운대");
    expect(result.keywords).toEqual(["해운대"]);
    expect(setup.fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries a timeout the same way it retries a 429, then gives up as TIMEOUT", async () => {
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const sleep = vi.fn(async () => {});
    const timeoutClient = new NvidiaIntentClient({
      apiKey: "fake-test-key",
      fetcher: fetcher as unknown as typeof fetch,
      sleep,
      timeoutMilliseconds: 1,
      maxAttempts: 2,
      retryBaseDelayMilliseconds: 5,
    });
    await expect(timeoutClient.extractIntent("해운대")).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable HTTP error (e.g. 401)", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(new Response("", { status: 401 }));
    await expect(setup.client.extractIntent("해운대")).rejects.toMatchObject({ code: "REJECTED" });
    expect(setup.fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx upstream error the same way as a 429", async () => {
    const setup = client();
    setup.fetcher.mockResolvedValue(new Response("", { status: 503 }));
    await expect(setup.client.extractIntent("해운대")).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(setup.fetcher).toHaveBeenCalledTimes(3);
  });

  it("truncates an over-length query before sending it, as input-token defense-in-depth", async () => {
    const setup = client({ maxInputCharacters: 10 });
    setup.fetcher.mockResolvedValue(chatResponse({ district: null, category: null, keywords: [], unsupportedConditions: [] }));
    await setup.client.extractIntent("가".repeat(50));
    const body = JSON.parse(String(setup.fetcher.mock.calls[0]?.[1]?.body));
    const sentQuery = JSON.parse(body.messages[1].content).user_query;
    expect(sentQuery).toHaveLength(10);
  });

  it("caps requested output tokens via max_tokens on every request", async () => {
    const setup = client({ maxOutputTokens: 123 });
    setup.fetcher.mockResolvedValue(chatResponse({ district: null, category: null, keywords: [], unsupportedConditions: [] }));
    await setup.client.extractIntent("해운대");
    const body = JSON.parse(String(setup.fetcher.mock.calls[0]?.[1]?.body));
    expect(body.max_tokens).toBe(123);
  });

  it("never sends the raw API key anywhere except the Authorization header", async () => {
    const setup = client({ apiKey: "super-secret-nvidia-key" });
    setup.fetcher.mockResolvedValue(chatResponse({ district: null, category: null, keywords: [], unsupportedConditions: [] }));
    await setup.client.extractIntent("해운대");
    const [, init] = setup.fetcher.mock.calls[0] ?? [];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer super-secret-nvidia-key");
    expect(String(init?.body)).not.toContain("super-secret-nvidia-key");
  });

  it("propagates a disallowed-model construction error as a NvidiaIntentError instance", () => {
    try {
      new NvidiaIntentClient({ apiKey: "key", model: "gpt-nope" as never });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NvidiaIntentError);
      expect((error as NvidiaIntentError).code).toBe("CONFIGURATION");
    }
  });
});
