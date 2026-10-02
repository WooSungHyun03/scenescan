// Keep source data intact. Never invent a translation or unverified filming facts.
export function getKoreanDescription(description: string, fallback: string): string {
  const value = description.trim();
  return /[가-힣]/u.test(value) ? value : fallback;
}
