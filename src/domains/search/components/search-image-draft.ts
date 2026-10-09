import type { District, LocationCategory, LocationSearchResult } from "@/types/domain";
import type { TextSearchNotice, TextSearchResponse, TextSearchResult } from "@/types/text-search";
// Transient client navigation handoff. Never persisted or uploaded to storage.
let pendingImage: File | null = null;

// Image mode and text mode keep fully separate input/result state --
// switching `mode` never mixes one mode's results into the other's, and
// each mode's own state survives a mode switch (and a round trip to a
// location detail page and back) independently.
export type SearchMode = "image" | "text";

export type TextSearchSessionState = {
  query: string;
  results: TextSearchResult[] | null;
  parsedQuery: TextSearchResponse["parsedQuery"] | null;
  unsupportedConditions: string[];
  notice: TextSearchNotice | null;
};

// `district` replaces the old nationwide `region` filter (see
// src/types/location-options.ts's single district definition). A stale
// session shaped like the old `{ region }` form is never read as a
// district -- search-workspace.tsx validates this value against
// DISTRICT_VALUES before trusting it, so a leftover/foreign value here
// just falls back to "부산 전체" instead of breaking the UI.
type SearchSession = {
  mode: SearchMode;
  file: File | null;
  district: District | "";
  category: LocationCategory | "";
  results: LocationSearchResult[] | null;
  text: TextSearchSessionState;
};
let session: SearchSession | null = null;
export function getSearchSession() { return session; }
export function setSearchSession(next: SearchSession) { session = next; }
export function setSearchImageDraft(file: File) { pendingImage = file; }
export function takeSearchImageDraft() {
  const file = pendingImage;
  pendingImage = null;
  return file;
}
