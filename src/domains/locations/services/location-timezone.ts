export const DEFAULT_LOCATION_TIME_ZONE = "Asia/Seoul";

export type ZonedDateTimeErrorCode =
  | "INVALID_DATE"
  | "INVALID_TIME"
  | "INVALID_TIME_ZONE"
  | "NONEXISTENT_LOCAL_TIME";

export type ZonedDateTimeResult =
  | {
      ok: true;
      instant: Date;
      timeZone: string;
      offsetMinutes: number;
      isAmbiguous: boolean;
    }
  | {
      ok: false;
      code: ZonedDateTimeErrorCode;
      timeZone: string;
    };

type WallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function utcEpoch(parts: WallClockParts) {
  const value = new Date(0);
  value.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  value.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return value.getTime();
}

function parseDate(value: string): WallClockParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const parts: WallClockParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: 0,
    minute: 0,
    second: 0,
  };
  const checked = new Date(utcEpoch(parts));
  return checked.getUTCFullYear() === parts.year &&
    checked.getUTCMonth() + 1 === parts.month &&
    checked.getUTCDate() === parts.day
    ? parts
    : null;
}

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

function getWallClockParts(formatter: Intl.DateTimeFormat, instant: Date) {
  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  } satisfies WallClockParts;
}

function hasSameWallClock(left: WallClockParts, right: WallClockParts) {
  return left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second;
}

function getOffsetMilliseconds(formatter: Intl.DateTimeFormat, epoch: number) {
  const wholeSecondEpoch = Math.trunc(epoch / 1_000) * 1_000;
  const zonedParts = getWallClockParts(formatter, new Date(wholeSecondEpoch));
  return utcEpoch(zonedParts) - wholeSecondEpoch;
}

/**
 * Resolves a location wall-clock date/time to an absolute UTC instant.
 *
 * The conversion never reads the browser or server's system time zone. For a
 * future location with an IANA time zone, pass that zone explicitly. During a
 * DST fall-back overlap the earlier instant is selected deterministically;
 * a spring-forward wall time that never existed is rejected.
 */
export function locationDateTimeToInstant({
  date,
  time,
  timeZone = DEFAULT_LOCATION_TIME_ZONE,
}: {
  date: string;
  time: string;
  timeZone?: string;
}): ZonedDateTimeResult {
  const dateParts = parseDate(date);
  if (!dateParts) return { ok: false, code: "INVALID_DATE", timeZone };

  const timeParts = parseTime(time);
  if (!timeParts) return { ok: false, code: "INVALID_TIME", timeZone };

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = getFormatter(timeZone);
  } catch {
    return { ok: false, code: "INVALID_TIME_ZONE", timeZone };
  }

  const requested: WallClockParts = { ...dateParts, ...timeParts };
  const wallClockEpoch = utcEpoch(requested);
  const possibleOffsets = new Set<number>();

  // Sampling both sides of the requested day captures standard and daylight
  // offsets without introducing a full time-zone dependency.
  for (let hours = -36; hours <= 36; hours += 6) {
    possibleOffsets.add(
      getOffsetMilliseconds(formatter, wallClockEpoch + hours * 60 * 60 * 1_000),
    );
  }

  const matchingEpochs = [...possibleOffsets]
    .map((offset) => wallClockEpoch - offset)
    .filter((epoch) =>
      hasSameWallClock(getWallClockParts(formatter, new Date(epoch)), requested),
    )
    .sort((left, right) => left - right);

  if (!matchingEpochs.length) {
    return { ok: false, code: "NONEXISTENT_LOCAL_TIME", timeZone };
  }

  const instant = new Date(matchingEpochs[0]);
  return {
    ok: true,
    instant,
    timeZone,
    offsetMinutes: getOffsetMilliseconds(formatter, instant.getTime()) / 60_000,
    isAmbiguous: matchingEpochs.length > 1,
  };
}

export function resolveLocationTimeZone(timeZone?: string | null) {
  return timeZone?.trim() || DEFAULT_LOCATION_TIME_ZONE;
}

export function formatUtcOffset(offsetMinutes: number) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(Math.round(offsetMinutes));
  const hours = Math.floor(absoluteMinutes / 60).toString().padStart(2, "0");
  const minutes = (absoluteMinutes % 60).toString().padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

export function formatTimeZoneWithOffset(
  timeZone = DEFAULT_LOCATION_TIME_ZONE,
  instant = new Date(),
) {
  const formatter = getFormatter(timeZone);
  const offsetMinutes = getOffsetMilliseconds(formatter, instant.getTime()) / 60_000;
  return `${timeZone} (${formatUtcOffset(offsetMinutes)})`;
}

export function formatInstantInTimeZone(
  instant: Date,
  timeZone = DEFAULT_LOCATION_TIME_ZONE,
) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
}
