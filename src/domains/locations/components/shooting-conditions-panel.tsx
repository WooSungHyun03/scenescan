"use client";

import { useMemo, useState } from "react";
import { SolarPanel } from "@/domains/locations/components/solar-panel";
import { WeatherPanel } from "@/domains/locations/components/weather-panel";
import { parseShootingTime } from "@/domains/locations/services/shooting-time";
import type { GeoPoint } from "@/types/domain";

export function getWeatherTargetInstant(
  shootDate: string,
  shootTime: string,
): string | null | undefined {
  if (!shootDate && !shootTime) return null;
  if (!shootDate || !shootTime) return undefined;
  return parseShootingTime(shootDate, shootTime)?.toISOString();
}

/** Keeps the shooting wall-clock input shared by independent solar and weather views. */
export function ShootingConditionsPanel({
  locationId,
  point,
}: {
  locationId: string;
  point: GeoPoint;
}) {
  const [shootDate, setShootDate] = useState("");
  const [shootTime, setShootTime] = useState("");
  const targetInstant = useMemo(
    () => getWeatherTargetInstant(shootDate, shootTime),
    [shootDate, shootTime],
  );

  return (
    <>
      <SolarPanel
        point={point}
        shootDate={shootDate}
        shootTime={shootTime}
        onShootDateChange={setShootDate}
        onShootTimeChange={setShootTime}
      />
      <WeatherPanel locationId={locationId} targetInstant={targetInstant} />
    </>
  );
}
