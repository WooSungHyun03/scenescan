// Deliberately NOT guarded by `import "server-only"`: this class never
// reads process.env itself (the API key always arrives via constructor
// options), so it has no inherent Next.js-only requirement -- the same
// reasoning scripts/shared/supabase-admin-client.ts documents for why IT
// skips the guard despite being security-sensitive. That lets
// scripts/nvidia/evaluate-intent.ts (requirement 7's eval tool, run via
// plain `node`, never through Next's bundler) import this class directly
// for its explicit, opt-in `--live` mode. The actual env var read happens
// exactly once, inside the `server-only`-guarded src/env/server.ts
// (requirement 3) -- see intent-client-factory.ts, the Next-side wiring
// that is guarded.
import { buildIntentMessages } from "./intent-prompt";
import { parseNvidiaIntentResponse, type NvidiaIntentResult } from "./intent-contract";
import { NVIDIA_INTENT_ALLOWED_MODELS, type NvidiaIntentModel } from "./intent-models";

export const NVIDIA_CHAT_COMPLETIONS_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const DEFAULT_TIMEOUT_MILLISECONDS = 4_000;
// 1 initial attempt + up to 2 retries (requirement 2: "제한된 재시도").
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MILLISECONDS = 300;
const DEFAULT_MAX_OUTPUT_TOKENS = 200;
// Defense-in-depth only: POST /api/search/text's own textSearchRequestSchema
// already caps `query` at 200 UTF-16 code units before this is ever called.
const DEFAULT_MAX_INPUT_CHARACTERS = 400;

export type NvidiaIntentErrorCode =
  | "CONFIGURATION"
  | "BUDGET_EXHAUSTED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "REJECTED"
  | "MALFORMED_RESPONSE"
  | "INVALID_RESULT";

export class NvidiaIntentError extends Error {
  readonly code: NvidiaIntentErrorCode;

  constructor(code: NvidiaIntentErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NvidiaIntentError";
    this.code = code;
  }
}

export type NvidiaIntentClientOptions = {
  apiKey: string | undefined;
  model?: NvidiaIntentModel;
  fetcher?: typeof fetch;
  timeoutMilliseconds?: number;
  maxAttempts?: number;
  retryBaseDelayMilliseconds?: number;
  maxOutputTokens?: number;
  maxInputCharacters?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function isRetryable(error: NvidiaIntentError): boolean {
  return error.code === "RATE_LIMITED" || error.code === "TIMEOUT" || error.code === "UPSTREAM";
}

export class NvidiaIntentClient {
  private readonly apiKey: string | undefined;
  private readonly model: NvidiaIntentModel;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMilliseconds: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMilliseconds: number;
  private readonly maxOutputTokens: number;
  private readonly maxInputCharacters: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: NvidiaIntentClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? NVIDIA_INTENT_ALLOWED_MODELS[0];
    if (!(NVIDIA_INTENT_ALLOWED_MODELS as readonly string[]).includes(this.model)) {
      throw new NvidiaIntentError("CONFIGURATION", `Model "${this.model}" is not in the NVIDIA intent allowlist`);
    }
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBaseDelayMilliseconds = options.retryBaseDelayMilliseconds ?? DEFAULT_RETRY_BASE_DELAY_MILLISECONDS;
    this.maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.maxInputCharacters = options.maxInputCharacters ?? DEFAULT_MAX_INPUT_CHARACTERS;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  /**
   * Calling code (intent-client-factory.ts's getNvidiaIntentClient, which
   * returns null without an apiKey) is expected to never construct/call
   * this without a key in the real app; this check exists so the class is
   * still safe to call directly (e.g. from a test or the eval script).
   */
  async extractIntent(query: string, options: { tryConsume?: () => boolean } = {}): Promise<NvidiaIntentResult> {
    if (!this.apiKey) throw new NvidiaIntentError("CONFIGURATION", "NVIDIA API key is not configured");
    const bounded = query.length > this.maxInputCharacters ? query.slice(0, this.maxInputCharacters) : query;

    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await this.sleep(this.retryBaseDelayMilliseconds * 2 ** (attempt - 1));
      }
      // Reserve immediately before each fetch, including retries. The callback
      // is request-scoped; concurrent requests share the caller's budget, not
      // mutable state on this client singleton. Direct offline evaluations may
      // omit it; the application adapter always supplies it.
      if (options.tryConsume && !options.tryConsume()) {
        throw new NvidiaIntentError("BUDGET_EXHAUSTED", "NVIDIA call budget exhausted");
      }
      try {
        return await this.attemptOnce(bounded);
      } catch (error) {
        lastError = error;
        if (!(error instanceof NvidiaIntentError) || !isRetryable(error)) throw error;
      }
    }
    throw lastError;
  }

  private async attemptOnce(query: string): Promise<NvidiaIntentResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      let response: Response;
      try {
        response = await this.fetcher(NVIDIA_CHAT_COMPLETIONS_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: buildIntentMessages(query),
            max_tokens: this.maxOutputTokens,
            temperature: 0,
            stream: false,
          }),
        });
      } catch (cause) {
        if (controller.signal.aborted) throw new NvidiaIntentError("TIMEOUT", "NVIDIA request timed out", { cause });
        throw new NvidiaIntentError("UPSTREAM", "NVIDIA request failed", { cause });
      }

      if (response.status === 429) {
        throw new NvidiaIntentError("RATE_LIMITED", "NVIDIA rejected the request with HTTP 429");
      }
      if (!response.ok) {
        // 5xx is treated as a transient upstream problem (retryable); any
        // other non-429 failure (400/401/403/404/...) means this exact
        // request will never succeed no matter how many times it is
        // retried, so it fails immediately instead of burning the retry
        // budget and the call budget on a request that cannot recover.
        if (response.status >= 500) {
          throw new NvidiaIntentError("UPSTREAM", `NVIDIA request failed with HTTP ${response.status}`);
        }
        throw new NvidiaIntentError("REJECTED", `NVIDIA rejected the request with HTTP ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (cause) {
        if (controller.signal.aborted) throw new NvidiaIntentError("TIMEOUT", "NVIDIA response body timed out", { cause });
        throw new NvidiaIntentError("MALFORMED_RESPONSE", "NVIDIA response is not valid JSON", { cause });
      }

      const content = (payload as { choices?: { message?: { content?: unknown } }[] } | null)
        ?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new NvidiaIntentError("MALFORMED_RESPONSE", "NVIDIA response is missing message content");
      }

      let structured: unknown;
      try {
        structured = JSON.parse(content);
      } catch (cause) {
        throw new NvidiaIntentError("MALFORMED_RESPONSE", "NVIDIA message content is not valid JSON", { cause });
      }

      const result = parseNvidiaIntentResponse(structured);
      if (!result) throw new NvidiaIntentError("INVALID_RESULT", "NVIDIA structured output failed validation");
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}
