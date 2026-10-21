import { type ApplicationError, validationError } from "@/shared/errors/application-error";

/** Enforce byte limits while reading, not after buffering an untrusted body. */
export async function readBoundedRequestText(
  request: Request,
  maxBytes: number,
  messages: { tooLarge: string; unreadable: string },
): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw validationError(messages.tooLarge);
  }

  let overflowError: ApplicationError | null = null;
  try {
    const reader = request.body?.getReader();
    if (!reader) return "";
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return text + decoder.decode();
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          // A source's cancellation promise must not delay the rejection.
          void reader.cancel().catch(() => undefined);
          overflowError = validationError(messages.tooLarge);
          throw overflowError;
        }
        text += decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (overflowError !== null && error === overflowError) throw overflowError;
    // Transport/parser errors may contain sensitive request content.
    throw validationError(messages.unreadable);
  }
}
