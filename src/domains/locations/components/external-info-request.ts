const DEFAULT_EXTERNAL_INFO_TIMEOUT_MILLISECONDS = 10_000;

const inflightRequests = new Map<string, Promise<unknown>>();

export class ExternalInfoHttpError extends Error {
  constructor(readonly status: number) {
    super(`External information request failed with status ${status}`);
    this.name = "ExternalInfoHttpError";
  }
}

function consumerAbort<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(new DOMException("Request aborted", "AbortError"));

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Request aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * Shares only an active request. Results are not retained, which keeps Kakao
 * provider data transient while preventing duplicate calls from concurrent
 * panels. A consumer abort never cancels another consumer's shared request.
 */
export function requestExternalInfo<T>({
  key,
  url,
  parse,
  signal,
  timeoutMilliseconds = DEFAULT_EXTERNAL_INFO_TIMEOUT_MILLISECONDS,
}: {
  key: string;
  url: string;
  parse(value: unknown): T;
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
}): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException("Request aborted", "AbortError"));
  // A provider grouping key is not a response identity: another panel can
  // select a different representative location for the same weather grid.
  const requestKey = JSON.stringify([key, url]);
  let request = inflightRequests.get(requestKey);
  if (!request) {
    request = fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMilliseconds),
    }).then(async (response) => {
      if (!response.ok) throw new ExternalInfoHttpError(response.status);
      return response.json().catch(() => null);
    }).finally(() => {
      if (inflightRequests.get(requestKey) === request) inflightRequests.delete(requestKey);
    });
    inflightRequests.set(requestKey, request);
  }
  // Share transport only; every consumer must validate its own contract.
  return consumerAbort(request, signal).then(parse);
}

export function clearExternalInfoRequestsForTest(): void {
  inflightRequests.clear();
}
