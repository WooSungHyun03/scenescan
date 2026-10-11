import { describe, expect, it, vi } from "vitest";
import type { MapAdapter } from "./map-adapter";
import { mountLocationMap } from "./location-map-mount";

const point = { latitude: 35.159, longitude: 129.105 };

function adapter(overrides: Partial<MapAdapter> = {}): MapAdapter {
  return {
    mount: vi.fn().mockResolvedValue({ destroy: vi.fn() }),
    mountMarkers: vi.fn().mockResolvedValue({ setActiveMarker: vi.fn(), destroy: vi.fn() }),
    ...overrides,
  };
}

describe("location map SDK fallback", () => {
  it("mounts the multi-marker key-free preview when the primary SDK fails", async () => {
    const primary = adapter({ mountMarkers: vi.fn().mockRejectedValue(new Error("SDK failed")) });
    const fallback = adapter();
    const markers = [
      { id: "location-origin", label: "장소", point },
      { id: "fixture:1", label: "주차장", point: { ...point, latitude: 35.16 }, rank: 1 },
    ];
    const result = await mountLocationMap({
      element: {} as HTMLElement,
      point,
      label: "장소",
      markers,
      markerOptions: { activeMarkerId: "fixture:1" },
      primary,
      fallback,
    });
    expect(result.usedFallback).toBe(true);
    expect(primary.mountMarkers).toHaveBeenCalledOnce();
    expect(fallback.mountMarkers).toHaveBeenCalledWith(
      expect.anything(),
      markers,
      { activeMarkerId: "fixture:1" },
    );
  });
});
