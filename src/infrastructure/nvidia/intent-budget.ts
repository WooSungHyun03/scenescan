// Requirement 2: "호출 예산(일/분 단위 상한)" -- a process-local, in-memory
// call budget shared across every request this server instance handles
// (same sharing shape as KmaWeatherClient's cache, src/infrastructure/
// weather/kma-client.ts). Deliberately simple counters, not a sliding
// window: a fixed UTC-minute/UTC-day bucket that resets when the clock
// crosses into a new bucket. Bounds this instance's calls only: cold starts
// reset counters and separate serverless instances have separate budgets.
// Not an account-wide spending cap or a precise rate limiter.
export const NVIDIA_INTENT_MAX_CALLS_PER_MINUTE = 10;
export const NVIDIA_INTENT_MAX_CALLS_PER_DAY = 500;

export type NvidiaCallBudgetOptions = {
  maxCallsPerMinute?: number;
  maxCallsPerDay?: number;
  now?: () => Date;
};

function minuteBucketKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}-${date.getUTCMinutes()}`;
}

function dayBucketKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

export class NvidiaCallBudget {
  private readonly maxCallsPerMinute: number;
  private readonly maxCallsPerDay: number;
  private readonly clock: () => Date;
  private minuteKey = "";
  private minuteCount = 0;
  private dayKey = "";
  private dayCount = 0;

  constructor(options: NvidiaCallBudgetOptions = {}) {
    this.maxCallsPerMinute = options.maxCallsPerMinute ?? NVIDIA_INTENT_MAX_CALLS_PER_MINUTE;
    this.maxCallsPerDay = options.maxCallsPerDay ?? NVIDIA_INTENT_MAX_CALLS_PER_DAY;
    this.clock = options.now ?? (() => new Date());
  }

  /**
   * Reserves one call against both the per-minute and per-day budget and
   * returns true, or returns false (reserving nothing) when either is
   * already exhausted for the current bucket. Must be called -- and must
   * return true -- before every real NVIDIA network call; it is never
   * retried or refunded on a subsequent request failure, by design: a
   * failed call still cost real latency/quota upstream.
   */
  tryConsume(): boolean {
    const now = this.clock();
    const minuteKey = minuteBucketKey(now);
    const dayKey = dayBucketKey(now);
    if (minuteKey !== this.minuteKey) {
      this.minuteKey = minuteKey;
      this.minuteCount = 0;
    }
    if (dayKey !== this.dayKey) {
      this.dayKey = dayKey;
      this.dayCount = 0;
    }
    if (this.minuteCount >= this.maxCallsPerMinute || this.dayCount >= this.maxCallsPerDay) {
      return false;
    }
    this.minuteCount += 1;
    this.dayCount += 1;
    return true;
  }
}
