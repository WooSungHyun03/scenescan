"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_NEARBY_PARKING_RADIUS_METERS,
  nearbyParkingResponseSchema,
  type NearbyParkingCandidate,
} from "@/types/place-discovery";
import { requestExternalInfo } from "./external-info-request";

type ParkingDiscoveryPhase = "loading" | "ready" | "empty" | "error";

type ParkingDiscoveryValue = {
  candidates: NearbyParkingCandidate[];
  radiusMeters: number;
  setRadiusMeters(radiusMeters: number): void;
  activeCandidateId: string | null;
  setActiveCandidateId(id: string | null): void;
  phase: ParkingDiscoveryPhase;
  errorMessage: string | null;
  retry(): void;
};

const ParkingDiscoveryContext = createContext<ParkingDiscoveryValue | null>(null);

export function ParkingDiscoveryProvider({
  locationId,
  children,
}: {
  locationId: string;
  children: ReactNode;
}) {
  const [radiusMeters, setRadiusMetersState] = useState(DEFAULT_NEARBY_PARKING_RADIUS_METERS);
  const [candidates, setCandidates] = useState<NearbyParkingCandidate[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ParkingDiscoveryPhase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const url = `/api/locations/${encodeURIComponent(locationId)}/parking?radius=${radiusMeters}`;
    void requestExternalInfo({
      key: `parking:${locationId}:${radiusMeters}`,
      url,
      signal: controller.signal,
      parse(value) {
        const parsed = nearbyParkingResponseSchema.safeParse(value);
        if (!parsed.success || parsed.data.locationId !== locationId) {
          throw new Error("Parking response contract is invalid");
        }
        return parsed.data;
      },
    }).then((body) => {
      if (!current) return;
      setCandidates(body.candidates);
      setActiveCandidateId((selected) => (
        body.candidates.some((candidate) => candidate.id === selected)
          ? selected
          : null
      ));
      setPhase(body.candidates.length ? "ready" : "empty");
    }).catch((error: unknown) => {
      if (!current || controller.signal.aborted) return;
      setCandidates([]);
      setActiveCandidateId(null);
      setPhase("error");
      setErrorMessage(
        error instanceof Error && error.message.includes("contract")
          ? "주변 주차장 응답을 확인할 수 없습니다."
          : "주변 주차장을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    });

    return () => {
      current = false;
      controller.abort();
    };
  }, [locationId, radiusMeters, retryKey]);

  const setRadiusMeters = useCallback((nextRadius: number) => {
    setPhase("loading");
    setErrorMessage(null);
    setRadiusMetersState(nextRadius);
  }, []);
  const retry = useCallback(() => {
    setPhase("loading");
    setErrorMessage(null);
    setRetryKey((value) => value + 1);
  }, []);
  const value = useMemo<ParkingDiscoveryValue>(() => ({
    candidates,
    radiusMeters,
    setRadiusMeters,
    activeCandidateId,
    setActiveCandidateId,
    phase,
    errorMessage,
    retry,
  }), [activeCandidateId, candidates, errorMessage, phase, radiusMeters, retry, setRadiusMeters]);

  return (
    <ParkingDiscoveryContext.Provider value={value}>
      {children}
    </ParkingDiscoveryContext.Provider>
  );
}

export function useParkingDiscovery(): ParkingDiscoveryValue | null {
  return useContext(ParkingDiscoveryContext);
}
