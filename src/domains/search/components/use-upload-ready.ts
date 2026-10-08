"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// File selection cannot be replayed safely before React attaches handlers.
// Keep SSR controls disabled until their client event handlers are ready.
export function useUploadReady() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
