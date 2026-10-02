import { describe, expect, it, vi } from "vitest";
import { selectClipBrowserDevice } from "./embedding-service";
import { loadBrowserExtractor } from "./load-browser-extractor";

describe("loadBrowserExtractor", () => {
  it("defaults missing and invalid device settings to WASM", () => {
    expect(selectClipBrowserDevice(undefined)).toBe("wasm");
    expect(selectClipBrowserDevice("auto")).toBe("wasm");
    expect(selectClipBrowserDevice("webgpu")).toBe("webgpu");
  });

  it("uses WASM directly for the production default", async () => {
    const extractor = vi.fn();
    const createPipeline = vi.fn(async () => extractor);

    await expect(loadBrowserExtractor({ preferredDevice: "wasm", createPipeline }))
      .resolves.toEqual({ extractor, device: "wasm" });
    expect(createPipeline).toHaveBeenCalledOnce();
    expect(createPipeline).toHaveBeenCalledWith("wasm");
  });

  it("uses WebGPU when an experimental build supports it", async () => {
    const extractor = vi.fn();
    const createPipeline = vi.fn(async () => extractor);

    await expect(loadBrowserExtractor({ preferredDevice: "webgpu", createPipeline }))
      .resolves.toEqual({ extractor, device: "webgpu" });
    expect(createPipeline).toHaveBeenCalledOnce();
    expect(createPipeline).toHaveBeenCalledWith("webgpu");
  });

  it("falls back once to WASM when WebGPU setup fails", async () => {
    const extractor = vi.fn();
    const createPipeline = vi.fn()
      .mockRejectedValueOnce(new Error("WebGPU unavailable"))
      .mockResolvedValueOnce(extractor);

    await expect(loadBrowserExtractor({ preferredDevice: "webgpu", createPipeline }))
      .resolves.toEqual({ extractor, device: "wasm" });
    expect(createPipeline.mock.calls).toEqual([["webgpu"], ["wasm"]]);
  });

  it("surfaces a WASM failure after WebGPU fallback", async () => {
    const createPipeline = vi.fn()
      .mockRejectedValueOnce(new Error("WebGPU unavailable"))
      .mockRejectedValueOnce(new Error("WASM unavailable"));

    await expect(loadBrowserExtractor({ preferredDevice: "webgpu", createPipeline }))
      .rejects.toThrow("WASM unavailable");
  });
});
