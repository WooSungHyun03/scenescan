import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearExternalInfoRequestsForTest,
  ExternalInfoHttpError,
  requestExternalInfo,
} from "./external-info-request";

afterEach(() => {
  clearExternalInfoRequestsForTest();
  vi.unstubAllGlobals();
});

describe("requestExternalInfo", () => {
  it("merges concurrent requests with the same provider key", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: 7 })));
    vi.stubGlobal("fetch", fetcher);
    const options = {
      key: "weather:60:127:current",
      url: "/api/weather",
      parse: (value: unknown) => (value as { value: number }).value,
    };

    await expect(Promise.all([
      requestExternalInfo(options),
      requestExternalInfo(options),
    ])).resolves.toEqual([7, 7]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("lets one consumer abort without cancelling a shared consumer", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetcher);
    const first = new AbortController();
    const second = new AbortController();
    const options = {
      key: "contacts:location",
      url: "/api/contacts",
      parse: (value: unknown) => value,
    };
    const aborted = requestExternalInfo({ ...options, signal: first.signal });
    const active = requestExternalInfo({ ...options, signal: second.signal });
    first.abort();
    resolveFetch(new Response(JSON.stringify({ ok: true })));

    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    await expect(active).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retain failed requests", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetcher);
    const options = {
      key: "parking:location:1000",
      url: "/api/parking",
      parse: (value: unknown) => value,
    };

    await expect(requestExternalInfo(options)).rejects.toBeInstanceOf(ExternalInfoHttpError);
    await expect(requestExternalInfo(options)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ends a stalled provider request at the configured timeout", async () => {
    const fetcher = vi.fn().mockImplementation((_url: string, init: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })
    ));
    vi.stubGlobal("fetch", fetcher);

    await expect(requestExternalInfo({
      key: "weather:timeout",
      url: "/api/weather",
      parse: (value: unknown) => value,
      timeoutMilliseconds: 5,
    })).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
