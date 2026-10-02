import type { ClipBrowserDevice } from "./embedding-service";

type LoadBrowserExtractorOptions<Extractor> = {
  preferredDevice: ClipBrowserDevice;
  createPipeline: (device: ClipBrowserDevice) => Promise<Extractor>;
};

export async function loadBrowserExtractor<Extractor>({
  preferredDevice,
  createPipeline,
}: LoadBrowserExtractorOptions<Extractor>): Promise<{
  extractor: Extractor;
  device: ClipBrowserDevice;
}> {
  if (preferredDevice === "webgpu") {
    try {
      return { extractor: await createPipeline("webgpu"), device: "webgpu" };
    } catch {
      return { extractor: await createPipeline("wasm"), device: "wasm" };
    }
  }

  return { extractor: await createPipeline("wasm"), device: "wasm" };
}
