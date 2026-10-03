import { describe, expect, it } from "vitest";

import { configureTransformersEnvironment } from "./configure-transformers-environment";

describe("configureTransformersEnvironment", () => {
  it("disables only the optional blob-backed WASM factory cache", () => {
    const environment = { useWasmCache: true, useBrowserCache: true };

    configureTransformersEnvironment(environment);

    expect(environment).toEqual({
      useWasmCache: false,
      useBrowserCache: true,
    });
  });
});
