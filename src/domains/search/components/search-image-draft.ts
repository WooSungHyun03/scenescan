import type { District, LocationCategory, LocationSearchResult } from "@/types/domain";
// Transient client navigation handoff. Never persisted or uploaded to storage.
let pendingImage: File | null = null;
// `district` replaces the old nationwide `region` filter (see
// src/types/location-options.ts's single district definition). A stale
// session shaped like the old `{ region }` form is never read as a
// district -- search-workspace.tsx validates this value against
// DISTRICT_VALUES before trusting it, so a leftover/foreign value here
// just falls back to "부산 전체" instead of breaking the UI.
type SearchSession = { file: File | null; district: District | ""; category: LocationCategory | ""; results: LocationSearchResult[] | null };
let session: SearchSession | null = null;
export function getSearchSession() { return session; }
export function setSearchSession(next: SearchSession) { session = next; }
export function setSearchImageDraft(file: File) { pendingImage = file; }
export function takeSearchImageDraft() {
  const file = pendingImage;
  pendingImage = null;
  return file;
}
