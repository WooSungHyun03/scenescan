import { afterEach, describe, expect, it, vi } from "vitest";

function element() {
  return { dataset: {}, style: {}, setAttribute: vi.fn(), replaceChildren: vi.fn(), remove: vi.fn() };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("Kakao adapter lifecycle", () => {
  it("marks multi-marker maps as real and removes all overlays on destroy", async () => {
    const nodes: ReturnType<typeof element>[] = [];
    const overlays: { setMap: ReturnType<typeof vi.fn>; setZIndex: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal("document", { createElement: () => { const node = element(); nodes.push(node); return node; } });
    vi.stubGlobal("window", { kakao: { maps: {
      load: (ready: () => void) => ready(),
      LatLng: class {},
      Map: class { setBounds() {} },
      LatLngBounds: class { extend() {} },
      CustomOverlay: class {
        setMap = vi.fn(); setZIndex = vi.fn();
        constructor() { overlays.push(this); }
      },
    } } });
    const { createKakaoMapAdapter } = await import("./map-adapter");
    const host = element();
    const controller = await createKakaoMapAdapter("test-public-key").mountMarkers(host as unknown as HTMLElement, [
      { id: "a", label: "첫 장소", point: { latitude: 37, longitude: 127 }, rank: 1 },
      { id: "b", label: "다음 장소", point: { latitude: 38, longitude: 128 }, rank: 2 },
    ]);
    expect(host.setAttribute).toHaveBeenCalledWith("data-map-mode", "kakao");
    expect(overlays).toHaveLength(2);
    controller.setActiveMarker("b");
    controller.destroy();
    overlays.forEach((overlay) => expect(overlay.setMap).toHaveBeenCalledWith(null));
    expect(nodes).toHaveLength(3); // detached SDK element + two accessible buttons
  });

  it("bounds a stalled SDK ready callback and releases the failed load for retry", async () => {
    vi.useFakeTimers();
    const sdk = element();
    vi.stubGlobal("document", { createElement: () => sdk });
    vi.stubGlobal("window", { kakao: { maps: { load: vi.fn() } } });
    const { createKakaoMapAdapter } = await import("./map-adapter");
    const pending = createKakaoMapAdapter("test-public-key").mount(element() as unknown as HTMLElement, { latitude: 37, longitude: 127 });
    const assertion = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(sdk.remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
