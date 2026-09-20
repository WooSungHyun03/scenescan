"use client";

import { useMemo, useState } from "react";
import { Sun } from "lucide-react";
import { getSolarPosition } from "@/features/solar/solar-position";
import type { GeoPoint } from "@/types/domain";

export function SolarPanel({ point }: { point: GeoPoint }) {
  const [dateTime, setDateTime] = useState("2026-09-20T15:00");
  const { latitude, longitude } = point;
  const position = useMemo(() => {
    const date = new Date(dateTime);
    return Number.isNaN(date.getTime()) ? null : getSolarPosition({ latitude, longitude }, date);
  }, [dateTime, latitude, longitude]);
  return <div><label className="block text-sm font-semibold">촬영 날짜 / 시간<input type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} className="mt-2 block w-full rounded-md border border-stone-300 bg-white p-2.5 font-normal" /></label>
    {position && <div className="mt-4 flex items-center gap-3 rounded-lg bg-amber-50 p-4 text-sm"><Sun className="text-amber-700" /><p>태양 방위각 <strong>{position.azimuthDegrees.toFixed(1)}°</strong> · 고도 <strong>{position.altitudeDegrees.toFixed(1)}°</strong><br /><span className="text-stone-600">{position.isAboveHorizon ? "지평선 위" : "지평선 아래"}</span></p></div>}</div>;
}
