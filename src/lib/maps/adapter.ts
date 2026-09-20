import type { GeoPoint } from "@/types/domain";

export interface MapAdapter {
  mount(element: HTMLElement, point: GeoPoint): Promise<void>;
}

export const mockMapAdapter: MapAdapter = {
  async mount(element, point) {
    element.setAttribute("data-map-mode", "mock");
    element.textContent = `지도 미리보기 · ${point.latitude.toFixed(3)}, ${point.longitude.toFixed(3)}`;
  },
};
