import { describe, expect, it, vi } from "vitest";
import { validationError } from "@/shared/errors/application-error";
import { readBoundedRequestText } from "./read-bounded-request-text";

const messages = { tooLarge: "요청이 너무 큽니다.", unreadable: "본문을 읽을 수 없습니다." };

function streamedRequest(body: ReadableStream<Uint8Array>, headers?: HeadersInit) {
  const init = { method: "POST", body, headers, duplex: "half" as const };
  return new Request("https://scenescan.example", init);
}

describe("readBoundedRequestText", () => {
  it("decodes split UTF-8 chunks and accepts the exact byte limit", async () => {
    const text = '{"query":"부산"}';
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    await expect(readBoundedRequestText(streamedRequest(body), bytes.length, messages)).resolves.toBe(text);
    expect(body.locked).toBe(false);
  });

  it("counts bytes rather than characters", async () => {
    const request = new Request("https://scenescan.example", { method: "POST", body: "부산" });
    await expect(readBoundedRequestText(request, 5, messages)).rejects.toMatchObject({
      code: "VALIDATION_ERROR", message: messages.tooLarge,
    });
    expect(request.body?.locked).toBe(false);
  });

  it("rejects a declared excess before reading a body", async () => {
    const request = new Request("https://scenescan.example", {
      method: "POST", headers: { "Content-Length": "100" }, body: "x",
    });
    const getReader = vi.spyOn(request.body!, "getReader");
    await expect(readBoundedRequestText(request, 4, messages)).rejects.toMatchObject({
      code: "VALIDATION_ERROR", message: messages.tooLarge,
    });
    expect(getReader).not.toHaveBeenCalled();
  });

  it.each(["rejects", "never settles"])("does not wait when source cancellation %s", async (mode) => {
    const cancel = vi.fn(() => mode === "rejects"
      ? Promise.reject(new Error("source-private-detail"))
      : new Promise<void>(() => undefined));
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(5)); }, cancel,
    }, { highWaterMark: 0 });
    await expect(readBoundedRequestText(streamedRequest(body), 4, messages)).rejects.toMatchObject({
      code: "VALIDATION_ERROR", message: messages.tooLarge,
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it.each([new Error("private-body-canary"), validationError("private-body-canary")])(
    "drops transport error details and releases the lock (%s)", async (error) => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) { controller.error(error); },
      });
      await expect(readBoundedRequestText(streamedRequest(body), 4, messages)).rejects.toMatchObject({
        code: "VALIDATION_ERROR", message: messages.unreadable, cause: undefined,
      });
      expect(body.locked).toBe(false);
    },
  );

  it("leaves empty-body validation to the endpoint", async () => {
    const request = new Request("https://scenescan.example", { method: "POST" });
    await expect(readBoundedRequestText(request, 4, messages)).resolves.toBe("");
  });
});
