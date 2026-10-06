import type { WeatherPurpose } from "@/types/weather";

export const KOREA_TIME_ZONE = "Asia/Seoul";
const KST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;
const HOUR_MILLISECONDS = 60 * 60 * 1_000;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;

export const KMA_SHORT_FORECAST_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23] as const;
export const KMA_PUBLICATION_DELAY_MINUTES = Object.freeze({
  observation: 10,
  "ultra-short-forecast": 15,
  "short-forecast": 10,
} satisfies Record<WeatherPurpose, number>);

export const KMA_MAX_ULTRA_SHORT_LEAD_MILLISECONDS = 6 * HOUR_MILLISECONDS;
export const KMA_MAX_SHORT_LEAD_MILLISECONDS = 4 * DAY_MILLISECONDS;
export const KMA_MAX_OBSERVATION_AGE_MILLISECONDS = HOUR_MILLISECONDS;

type KstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type KmaBaseTime = {
  purpose: WeatherPurpose;
  baseDate: string;
  baseTime: string;
  issuedAt: string;
  releasedAt: Date;
  nextReleaseAt: Date;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toKstParts(instant: Date): KstParts {
  const shifted = new Date(instant.getTime() + KST_OFFSET_MILLISECONDS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function fromKstParts(parts: KstParts): Date {
  return new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  ) - KST_OFFSET_MILLISECONDS);
}

export function formatKmaDateTime(baseDate: string, baseTime: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(baseDate);
  const timeMatch = /^(\d{2})(\d{2})$/.exec(baseTime);
  if (!match || !timeMatch) return null;
  const parts: KstParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
  if (parts.hour > 23 || parts.minute > 59) return null;
  const instant = fromKstParts(parts);
  const roundTrip = toKstParts(instant);
  if (roundTrip.year !== parts.year || roundTrip.month !== parts.month || roundTrip.day !== parts.day
    || roundTrip.hour !== parts.hour || roundTrip.minute !== parts.minute) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${timeMatch[1]}:${timeMatch[2]}:00+09:00`;
}

function baseCandidates(purpose: WeatherPurpose, now: Date): Array<{ issued: Date; released: Date }> {
  const today = toKstParts(now);
  const dayAnchor = fromKstParts({ ...today, hour: 0, minute: 0 });
  const candidates: Array<{ issued: Date; released: Date }> = [];
  for (let dayOffset = -2; dayOffset <= 1; dayOffset += 1) {
    const date = new Date(dayAnchor.getTime() + dayOffset * DAY_MILLISECONDS);
    const dateParts = toKstParts(date);
    const hours = purpose === "short-forecast"
      ? KMA_SHORT_FORECAST_BASE_HOURS
      : Array.from({ length: 24 }, (_, hour) => hour);
    const baseMinute = purpose === "ultra-short-forecast" ? 30 : 0;
    for (const hour of hours) {
      const issued = fromKstParts({ ...dateParts, hour, minute: baseMinute });
      const released = new Date(
        issued.getTime() + KMA_PUBLICATION_DELAY_MINUTES[purpose] * 60_000,
      );
      candidates.push({ issued, released });
    }
  }
  return candidates.sort((left, right) => left.issued.getTime() - right.issued.getTime());
}

export function getLatestKmaBaseTime(purpose: WeatherPurpose, now: Date): KmaBaseTime {
  if (!Number.isFinite(now.getTime())) throw new Error("Current time must be valid");
  const candidates = baseCandidates(purpose, now);
  const available = candidates.filter((candidate) => candidate.released.getTime() <= now.getTime());
  const selected = available.at(-1);
  const next = candidates.find((candidate) => candidate.released.getTime() > now.getTime());
  if (!selected || !next) throw new Error("Unable to resolve KMA publication time");
  const parts = toKstParts(selected.issued);
  const baseDate = `${parts.year}${pad(parts.month)}${pad(parts.day)}`;
  const baseTime = `${pad(parts.hour)}${pad(parts.minute)}`;
  return {
    purpose,
    baseDate,
    baseTime,
    issuedAt: formatKmaDateTime(baseDate, baseTime)!,
    releasedAt: selected.released,
    nextReleaseAt: next.released,
  };
}

export type WeatherPurposeSelection =
  | { ok: true; purpose: WeatherPurpose }
  | { ok: false; reason: "past" | "future" };

export function selectWeatherPurpose(target: Date, now: Date): WeatherPurposeSelection {
  if (!Number.isFinite(target.getTime()) || !Number.isFinite(now.getTime())) {
    return { ok: false, reason: "future" };
  }
  const lead = target.getTime() - now.getTime();
  if (lead <= 0) {
    return lead >= -KMA_MAX_OBSERVATION_AGE_MILLISECONDS
      ? { ok: true, purpose: "observation" }
      : { ok: false, reason: "past" };
  }
  if (lead <= KMA_MAX_ULTRA_SHORT_LEAD_MILLISECONDS) {
    return { ok: true, purpose: "ultra-short-forecast" };
  }
  if (lead <= KMA_MAX_SHORT_LEAD_MILLISECONDS) {
    return { ok: true, purpose: "short-forecast" };
  }
  return { ok: false, reason: "future" };
}
