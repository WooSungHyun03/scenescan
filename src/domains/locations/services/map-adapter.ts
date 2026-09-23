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

type KakaoMaps = {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => unknown;
  Map: new (container: HTMLElement, options: { center: unknown; level: number }) => unknown;
  Marker: new (options: { position: unknown; map: unknown }) => unknown;
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

let loading: Promise<void> | null = null;

function loadKakao(key: string): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.onload = () => window.kakao?.maps.load(resolve);
    script.onerror = () => reject(new Error("Kakao Maps SDK failed to load"));
    document.head.appendChild(script);
  });
  return loading;
}

export function createKakaoMapAdapter(key: string): MapAdapter {
  return {
    async mount(element, point) {
      await loadKakao(key);
      const maps = window.kakao!.maps;
      const center = new maps.LatLng(point.latitude, point.longitude);
      const map = new maps.Map(element, { center, level: 4 });
      new maps.Marker({ position: center, map });
    },
  };
}
