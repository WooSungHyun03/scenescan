import { describe, expect, it, vi } from "vitest";
import { NvidiaIntentClient, NvidiaIntentError } from "./intent-client";

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
