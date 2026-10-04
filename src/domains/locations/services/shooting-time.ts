/** All current catalog locations are in Korea. Never use the device timezone. */
export const SHOOTING_TIME_ZONE = "Asia/Seoul";

export function parseShootingTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const instant = new Date(`${date}T${time}:00+09:00`);
  if (!Number.isFinite(instant.getTime())) return null;
  // Date accepts e.g. February 30 by rolling into March; reject that input.
  const local = new Date(instant.getTime() + 9 * 60 * 60 * 1000).toISOString();
  return local.slice(0, 16) === `${date}T${time}` ? instant : null;
}
