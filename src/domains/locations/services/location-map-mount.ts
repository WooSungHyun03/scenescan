import type { GeoPoint } from "@/types/domain";
import type {
  MapAdapter,
  MapMarkerController,
  MapMarkerItem,
  MapMarkerOptions,
  MapMountController,
} from "./map-adapter";

export type LocationMapMountResult = {
  controller: MapMountController | MapMarkerController;
  usedFallback: boolean;
};

type MountLocationMapOptions = {
  element: HTMLElement;
  point: GeoPoint;
  label: string;
  markers: MapMarkerItem[];
  markerOptions: MapMarkerOptions;
  primary: MapAdapter;
  fallback: MapAdapter;
};

async function mountWith(
  adapter: MapAdapter,
  options: MountLocationMapOptions,
): Promise<MapMountController | MapMarkerController> {
  return options.markers.length > 1
    ? adapter.mountMarkers(options.element, options.markers, options.markerOptions)
    : adapter.mount(options.element, options.point, options.label);
}

/** Keeps a map SDK failure local to the map and immediately mounts the key-free preview. */
export async function mountLocationMap(
  options: MountLocationMapOptions,
): Promise<LocationMapMountResult> {
  try {
    return { controller: await mountWith(options.primary, options), usedFallback: false };
  } catch {
    return { controller: await mountWith(options.fallback, options), usedFallback: true };
  }
}
