import type { GeoPoint } from "@/types/domain";

export interface MapMarkerItem {
  id: string;
  label: string;
  point: GeoPoint;
  rank?: number;
}

export interface MapMarkerOptions {
  activeMarkerId?: string | null;
  onMarkerActivate?: (markerId: string) => void;
}

export interface MapMarkerController {
  setActiveMarker(markerId: string | null): void;
  destroy(): void;
}

export interface MapMountController {
  destroy(): void;
}

export interface MapAdapter {
  mount(
    element: HTMLElement,
    point: GeoPoint,
    label?: string,
  ): Promise<MapMountController>;
  mountMarkers(
    element: HTMLElement,
    markers: MapMarkerItem[],
    options?: MapMarkerOptions,
  ): Promise<MapMarkerController>;
}

const markerBaseClass =
  "z-10 grid h-9 min-w-9 place-items-center rounded-full border-2 px-2 text-xs font-bold shadow-md transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-950";
const markerIdleClass = "border-white bg-stone-900 text-white hover:scale-110";
const markerActiveClass =
  "z-20 scale-110 border-emerald-950 bg-emerald-300 text-emerald-950 ring-4 ring-white/80";

function isValidPoint(point: GeoPoint) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function createMarkerButton(marker: MapMarkerItem) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = marker.rank?.toString() ?? "•";
  button.title = marker.label;
  button.setAttribute(
    "aria-label",
    `${marker.rank ? `${marker.rank}위 ` : ""}${marker.label} 위치`,
  );
  return button;
}

function updateMarkerButton(button: HTMLButtonElement, active: boolean) {
  button.className = `${markerBaseClass} ${button.dataset.positioning ?? ""} ${
    active ? markerActiveClass : markerIdleClass
  }`;
  button.setAttribute("aria-pressed", String(active));
}

export const mockMapAdapter: MapAdapter = {
  async mount(element, point, label = "장소") {
    element.replaceChildren();
    element.setAttribute("data-map-mode", "mock");
    element.style.position = "relative";
    element.style.overflow = "hidden";

    const backdrop = document.createElement("div");
    backdrop.className = "absolute inset-0 bg-emerald-50";
    backdrop.style.backgroundImage =
      "linear-gradient(rgba(6,78,59,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(6,78,59,.08) 1px, transparent 1px)";
    backdrop.style.backgroundSize = "32px 32px";
    backdrop.setAttribute("aria-hidden", "true");
    element.appendChild(backdrop);

    const content = document.createElement("div");
    content.className =
      "relative z-10 mx-4 rounded-xl border border-emerald-200 bg-white/95 px-4 py-3 text-center shadow-sm";
    const title = document.createElement("strong");
    title.className = "block text-sm text-emerald-950";
    title.textContent = label.trim() || "장소";
    const coordinates = document.createElement("span");
    coordinates.className = "mt-1 block text-xs text-stone-600";
    coordinates.textContent = isValidPoint(point)
      ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
      : "좌표 정보 없음";
    const notice = document.createElement("span");
    notice.className = "mt-1 block text-[11px] font-semibold text-emerald-800";
    notice.textContent = "Kakao Map을 사용할 수 없어 지도 미리보기를 표시합니다.";
    content.append(title, coordinates, notice);
    element.appendChild(content);

    return {
      destroy() {
        // React Strict Mode can start a replacement mount before this
        // asynchronous mount's cleanup runs. Remove only the nodes owned by
        // this controller so stale cleanup cannot erase the newer map.
        backdrop.remove();
        content.remove();
      },
    };
  },

  async mountMarkers(element, markers, options = {}) {
    const validMarkers = markers.filter((marker) => isValidPoint(marker.point));
    element.replaceChildren();
    element.setAttribute("data-map-mode", "mock");
    element.style.position = "relative";
    element.style.overflow = "hidden";

    const backdrop = document.createElement("div");
    backdrop.className = "absolute inset-0 bg-emerald-50";
    backdrop.style.backgroundImage =
      "linear-gradient(rgba(6,78,59,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(6,78,59,.08) 1px, transparent 1px)";
    backdrop.style.backgroundSize = "32px 32px";
    backdrop.setAttribute("aria-hidden", "true");
    element.appendChild(backdrop);

    const label = document.createElement("span");
    label.className =
      "absolute left-3 top-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-emerald-950 shadow-sm";
    label.textContent = "지도 미리보기";
    label.setAttribute("aria-hidden", "true");
    element.appendChild(label);
    const ownedNodes: HTMLElement[] = [backdrop, label];

    if (validMarkers.length === 0) {
      const empty = document.createElement("p");
      empty.className =
        "absolute inset-0 flex items-center justify-center text-sm text-stone-600";
      empty.textContent = "표시할 위치가 없습니다.";
      element.appendChild(empty);
      ownedNodes.push(empty);
      return {
        setActiveMarker() {
          // There are no markers to update.
        },
        destroy() {
          ownedNodes.forEach((node) => node.remove());
        },
      };
    }

    const latitudes = validMarkers.map((marker) => marker.point.latitude);
    const longitudes = validMarkers.map((marker) => marker.point.longitude);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const latitudeSpan = maxLatitude - minLatitude;
    const longitudeSpan = maxLongitude - minLongitude;
    const buttons = new Map<string, HTMLButtonElement>();

    for (const marker of validMarkers) {
      const button = createMarkerButton(marker);
      button.dataset.positioning =
        "absolute -translate-x-1/2 -translate-y-1/2";
      const x = longitudeSpan
        ? 10 + ((marker.point.longitude - minLongitude) / longitudeSpan) * 80
        : 50;
      const y = latitudeSpan
        ? 90 - ((marker.point.latitude - minLatitude) / latitudeSpan) * 80
        : 50;
      button.style.left = `${x}%`;
      button.style.top = `${y}%`;
      const activate = () => options.onMarkerActivate?.(marker.id);
      button.onclick = activate;
      button.onfocus = activate;
      button.onmouseenter = activate;
      updateMarkerButton(button, marker.id === options.activeMarkerId);
      buttons.set(marker.id, button);
      element.appendChild(button);
      ownedNodes.push(button);
    }

    return {
      setActiveMarker(markerId) {
        for (const [id, button] of buttons) {
          updateMarkerButton(button, id === markerId);
        }
      },
      destroy() {
        for (const button of buttons.values()) {
          button.onclick = null;
          button.onfocus = null;
          button.onmouseenter = null;
        }
        ownedNodes.forEach((node) => node.remove());
      },
    };
  },
};

type KakaoMap = {
  setBounds(
    bounds: unknown,
    top?: number,
    right?: number,
    bottom?: number,
    left?: number,
  ): void;
};

type KakaoOverlay = {
  setMap(map: KakaoMap | null): void;
  setZIndex(zIndex: number): void;
};

type KakaoMarker = {
  setMap(map: KakaoMap | null): void;
};

type KakaoBounds = {
  extend(point: unknown): void;
};

type KakaoMaps = {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => unknown;
  LatLngBounds: new () => KakaoBounds;
  Map: new (
    container: HTMLElement,
    options: { center: unknown; level: number },
  ) => KakaoMap;
  Marker: new (options: {
    position: unknown;
    map: KakaoMap;
  }) => KakaoMarker;
  CustomOverlay: new (options: {
    position: unknown;
    map: KakaoMap;
    content: HTMLElement;
    yAnchor: number;
  }) => KakaoOverlay;
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

let loading: Promise<void> | null = null;

function loadKakao(key: string): Promise<void> {
  if (window.kakao?.maps) {
    return new Promise((resolve) => window.kakao!.maps.load(resolve));
  }

  if (!loading) {
    const request = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
      script.onload = () => {
        if (!window.kakao) {
          reject(new Error("Kakao Maps SDK is unavailable"));
          return;
        }
        window.kakao.maps.load(resolve);
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("Kakao Maps SDK failed to load"));
      };
      document.head.appendChild(script);
    });
    loading = request.catch((error: unknown) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

export function createKakaoMapAdapter(key: string): MapAdapter {
  return {
    async mount(element, point, label = "장소") {
      if (!isValidPoint(point)) {
        throw new Error("Map coordinates are invalid");
      }

      await loadKakao(key);
      const maps = window.kakao!.maps;
      element.replaceChildren();
      const center = new maps.LatLng(point.latitude, point.longitude);
      const map = new maps.Map(element, { center, level: 4 });
      const marker = new maps.Marker({ position: center, map });
      const labelElement = document.createElement("div");
      labelElement.className =
        "max-w-52 -translate-y-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-center text-xs font-bold text-stone-900 shadow-md";
      labelElement.textContent = label.trim() || "장소";
      const overlay = new maps.CustomOverlay({
        position: center,
        map,
        content: labelElement,
        yAnchor: 1,
      });

      element.setAttribute("data-map-mode", "kakao");
      return {
        destroy() {
          marker.setMap(null);
          overlay.setMap(null);
        },
      };
    },

    async mountMarkers(element, markers, options = {}) {
      const validMarkers = markers.filter((marker) => isValidPoint(marker.point));
      if (validMarkers.length === 0) {
        element.textContent = "표시할 위치가 없습니다.";
        return {
          setActiveMarker() {
            // There are no markers to update.
          },
          destroy() {
            element.replaceChildren();
          },
        };
      }

      await loadKakao(key);
      const maps = window.kakao!.maps;
      element.replaceChildren();
      const positions = validMarkers.map(
        (marker) => new maps.LatLng(marker.point.latitude, marker.point.longitude),
      );
      const map = new maps.Map(element, { center: positions[0], level: 7 });
      const bounds = new maps.LatLngBounds();
      const renderedMarkers = new Map<
        string,
        { button: HTMLButtonElement; overlay: KakaoOverlay }
      >();

      validMarkers.forEach((marker, index) => {
        const position = positions[index];
        bounds.extend(position);
        const button = createMarkerButton(marker);
        const activate = () => options.onMarkerActivate?.(marker.id);
        button.onclick = activate;
        button.onfocus = activate;
        button.onmouseenter = activate;
        updateMarkerButton(button, marker.id === options.activeMarkerId);
        const overlay = new maps.CustomOverlay({
          position,
          map,
          content: button,
          yAnchor: 0.5,
        });
        overlay.setZIndex(marker.id === options.activeMarkerId ? 20 : 10);
        renderedMarkers.set(marker.id, { button, overlay });
      });

      if (validMarkers.length > 1) {
        map.setBounds(bounds, 48, 48, 48, 48);
      }

      return {
        setActiveMarker(markerId) {
          for (const [id, rendered] of renderedMarkers) {
            const active = id === markerId;
            updateMarkerButton(rendered.button, active);
            rendered.overlay.setZIndex(active ? 20 : 10);
          }
        },
        destroy() {
          for (const rendered of renderedMarkers.values()) {
            rendered.button.onclick = null;
            rendered.button.onfocus = null;
            rendered.button.onmouseenter = null;
            rendered.overlay.setMap(null);
          }
        },
      };
    },
  };
}
