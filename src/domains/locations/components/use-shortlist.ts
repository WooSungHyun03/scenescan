"use client";

import { useShortlistContext } from "./shortlist-provider";

/** Preserves the original hook API while selecting guest/account storage. */
export function useShortlist() {
  return useShortlistContext();
}
