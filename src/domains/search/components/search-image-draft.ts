import type { LocationCategory, LocationSearchResult, Region } from "@/types/domain";
// Transient client navigation handoff. Never persisted or uploaded to storage.
let pendingImage: File | null = null;
type SearchSession = { file: File | null; region: Region | ""; category: LocationCategory | ""; results: LocationSearchResult[] | null };
let session: SearchSession | null = null;
export function getSearchSession() { return session; }
export function setSearchSession(next: SearchSession) { session = next; }
export function setSearchImageDraft(file: File) { pendingImage = file; }
export function takeSearchImageDraft() {
  const file = pendingImage;
  pendingImage = null;
  return file;
}
