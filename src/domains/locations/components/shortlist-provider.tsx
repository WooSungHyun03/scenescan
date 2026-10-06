"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  loadAccountShortlist,
  mergeBrowserShortlist,
  setAccountShortlistLocation,
  ShortlistClientError,
} from "@/domains/users/services/shortlist-client";
import { commitShortlistMutation } from "@/domains/users/services/shortlist-optimistic";
import { getSupabaseBrowserAuthClient } from "@/infrastructure/supabase/browser-auth-client";
import { locationIdSchema } from "@/types/contracts";
import {
  normalizeShortlistIds,
  parseShortlistIds,
  SHORTLIST_ACCOUNT_SYNC_KEY,
  SHORTLIST_AUTH_RESET_EVENT,
  SHORTLIST_CHANGE_EVENT,
  SHORTLIST_STORAGE_KEY,
} from "./shortlist-storage";

type StorageMode = "loading" | "guest" | "account";

type ShortlistSnapshot = {
  ids: string[];
  isReady: boolean;
  isSaving: boolean;
  mode: StorageMode;
  userId: string | null;
  pendingBrowserIds: string[];
  error: string | null;
  migrationMessage: string | null;
};

type ShortlistContextValue = ShortlistSnapshot & {
  count: number;
  has(locationId: string): boolean;
  toggle(locationId: string): Promise<boolean>;
  remove(locationId: string): Promise<boolean>;
  importBrowserIds(): Promise<boolean>;
  dismissBrowserImport(): void;
};

const initialSnapshot: ShortlistSnapshot = {
  ids: [], isReady: false, isSaving: false, mode: "loading", userId: null,
  pendingBrowserIds: [], error: null, migrationMessage: null,
};
const ShortlistContext = createContext<ShortlistContextValue | null>(null);

function readBrowserIds(): string[] {
  return parseShortlistIds(window.localStorage.getItem(SHORTLIST_STORAGE_KEY));
}

function validMigrationCandidates(ids: readonly string[]): string[] {
  return normalizeShortlistIds(ids).filter(
    (id) => locationIdSchema.safeParse(id).success,
  );
}

function errorText(error: unknown): string {
  return error instanceof ShortlistClientError
    ? error.message
    : "관심 장소를 동기화하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function ShortlistProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const snapshotRef = useRef(snapshot);
  const transitionRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const updateSnapshot = useCallback((update: (current: ShortlistSnapshot) => ShortlistSnapshot) => {
    setSnapshot((current) => {
      const next = update(current);
      snapshotRef.current = next;
      return next;
    });
  }, []);

  const notifyAccountTabs = useCallback((userId: string, ids: string[]) => {
    if (channelRef.current) {
      channelRef.current.postMessage({ userId, ids });
      return;
    }
    try {
      window.localStorage.setItem(SHORTLIST_ACCOUNT_SYNC_KEY, crypto.randomUUID());
      window.localStorage.removeItem(SHORTLIST_ACCOUNT_SYNC_KEY);
    } catch {
      // Cross-tab refresh is best effort when storage is blocked.
    }
  }, []);

  useEffect(() => {
    let active = true;
    const timers = new Set<number>();
    const authClient = getSupabaseBrowserAuthClient();
    if ("BroadcastChannel" in window) channelRef.current = new BroadcastChannel("scenescan-shortlist-v1");

    async function transitionTo(userId: string | null) {
      const transition = ++transitionRef.current;
      updateSnapshot(() => ({ ...initialSnapshot, userId, mode: userId ? "account" : "guest" }));
      if (!userId) {
        try {
          const ids = readBrowserIds();
          if (active && transition === transitionRef.current) {
            updateSnapshot((current) => ({ ...current, ids, isReady: true, error: null }));
          }
        } catch {
          if (active && transition === transitionRef.current) {
            updateSnapshot((current) => ({ ...current, isReady: true, error: "이 브라우저에서는 관심 장소를 불러올 수 없습니다." }));
          }
        }
        return;
      }

      try {
        const { ids } = await loadAccountShortlist();
        if (!active || transition !== transitionRef.current) return;
        let browserIds: string[] = [];
        try { browserIds = readBrowserIds(); } catch { /* Account storage remains available. */ }
        updateSnapshot((current) => ({
          ...current,
          ids,
          isReady: true,
          pendingBrowserIds: validMigrationCandidates(browserIds),
          error: null,
        }));
      } catch (error) {
        if (active && transition === transitionRef.current) {
          updateSnapshot((current) => ({ ...current, isReady: true, error: errorText(error) }));
        }
      }
    }

    function scheduleAuthRefresh() {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (!active || !authClient) {
          void transitionTo(null);
          return;
        }
        void authClient.auth.getUser()
          .then(({ data, error }) => transitionTo(error ? null : (data.user?.id ?? null)))
          .catch(() => transitionTo(null));
      }, 0);
      timers.add(timer);
    }

    function handleAuthBoundaryChange() {
      transitionRef.current += 1;
      updateSnapshot(() => initialSnapshot);
      scheduleAuthRefresh();
    }

    function syncBrowserStorage() {
      const current = snapshotRef.current;
      let browserIds: string[] = [];
      try { browserIds = readBrowserIds(); } catch { return; }
      if (current.mode === "guest") {
        updateSnapshot((value) => ({ ...value, ids: browserIds, error: null }));
      } else if (current.mode === "account") {
        updateSnapshot((value) => ({ ...value, pendingBrowserIds: validMigrationCandidates(browserIds) }));
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === SHORTLIST_STORAGE_KEY) syncBrowserStorage();
      if (event.key === SHORTLIST_ACCOUNT_SYNC_KEY && snapshotRef.current.mode === "account") {
        const userId = snapshotRef.current.userId;
        if (!userId) return;
        void loadAccountShortlist().then(({ ids }) => {
          if (active && snapshotRef.current.userId === userId) {
            updateSnapshot((value) => ({ ...value, ids, error: null }));
          }
        }).catch(() => undefined);
      }
    }

    function handleAccountMessage(event: MessageEvent<unknown>) {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      const { userId, ids } = message as { userId?: unknown; ids?: unknown };
      const current = snapshotRef.current;
      if (typeof userId !== "string" || userId !== current.userId || current.mode !== "account") return;
      const normalizedIds = normalizeShortlistIds(ids).filter((id) => locationIdSchema.safeParse(id).success);
      updateSnapshot((value) => ({ ...value, ids: normalizedIds, error: null }));
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SHORTLIST_CHANGE_EVENT, syncBrowserStorage);
    window.addEventListener(SHORTLIST_AUTH_RESET_EVENT, handleAuthBoundaryChange);
    channelRef.current?.addEventListener("message", handleAccountMessage);
    scheduleAuthRefresh();
    const subscription = authClient?.auth.onAuthStateChange((event, session) => {
      const identityChanged = event === "SIGNED_OUT"
        || (event === "SIGNED_IN" && session?.user.id !== snapshotRef.current.userId);
      if (identityChanged) {
        handleAuthBoundaryChange();
      } else {
        scheduleAuthRefresh();
      }
    }).data.subscription;

    return () => {
      active = false;
      transitionRef.current += 1;
      for (const timer of timers) window.clearTimeout(timer);
      subscription?.unsubscribe();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SHORTLIST_CHANGE_EVENT, syncBrowserStorage);
      window.removeEventListener(SHORTLIST_AUTH_RESET_EVENT, handleAuthBoundaryChange);
      channelRef.current?.removeEventListener("message", handleAccountMessage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [updateSnapshot]);

  const saveGuestIds = useCallback((ids: string[]): boolean => {
    try {
      window.localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(ids));
      updateSnapshot((current) => ({ ...current, ids, error: null }));
      window.dispatchEvent(new CustomEvent(SHORTLIST_CHANGE_EVENT, { detail: ids }));
      return true;
    } catch {
      updateSnapshot((current) => ({ ...current, error: "관심 장소를 브라우저에 저장하지 못했습니다." }));
      return false;
    }
  }, [updateSnapshot]);

  const setSaved = useCallback(async (locationId: string, saved: boolean): Promise<boolean> => {
    const id = locationId.trim();
    const current = snapshotRef.current;
    if (!id || !current.isReady || current.isSaving) return false;
    const previousIds = current.ids;
    const optimisticIds = saved
      ? normalizeShortlistIds([...previousIds, id])
      : previousIds.filter((candidate) => candidate !== id);
    if (current.mode === "guest") return saveGuestIds(optimisticIds);
    if (current.mode !== "account" || !current.userId) return false;

    const userId = current.userId;
    updateSnapshot((value) => ({ ...value, ids: optimisticIds, isSaving: true, error: null }));
    const result = await commitShortlistMutation(previousIds, async () => (
      await setAccountShortlistLocation(id, saved)
    ).ids);
    if (snapshotRef.current.userId !== userId) return false;
    updateSnapshot((value) => ({ ...value, ids: result.ids, isSaving: false, error: result.committed ? null : errorText(result.error) }));
    if (result.committed) notifyAccountTabs(userId, result.ids);
    return result.committed;
  }, [notifyAccountTabs, saveGuestIds, updateSnapshot]);

  const toggle = useCallback((locationId: string) => (
    setSaved(locationId, !snapshotRef.current.ids.includes(locationId.trim()))
  ), [setSaved]);
  const remove = useCallback((locationId: string) => setSaved(locationId, false), [setSaved]);

  const importBrowserIds = useCallback(async (): Promise<boolean> => {
    const current = snapshotRef.current;
    if (current.mode !== "account" || !current.userId || current.isSaving || current.pendingBrowserIds.length === 0) return false;
    const userId = current.userId;
    const candidates = current.pendingBrowserIds;
    updateSnapshot((value) => ({ ...value, isSaving: true, error: null, migrationMessage: null }));
    try {
      const result = await mergeBrowserShortlist(candidates);
      if (snapshotRef.current.userId !== userId) return false;
      try {
        window.localStorage.removeItem(SHORTLIST_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent(SHORTLIST_CHANGE_EVENT, { detail: [] }));
      } catch { /* The account merge is already committed. */ }
      updateSnapshot((value) => ({
        ...value,
        ids: result.ids,
        pendingBrowserIds: [],
        isSaving: false,
        error: null,
        migrationMessage: result.ignoredCount > 0
          ? `${result.mergedCount}곳을 계정에 추가했고, 삭제되었거나 없는 ${result.ignoredCount}곳은 제외했습니다.`
          : `${result.mergedCount}곳을 계정 관심 장소에 추가했습니다.`,
      }));
      notifyAccountTabs(userId, result.ids);
      return true;
    } catch (error) {
      if (snapshotRef.current.userId === userId) {
        updateSnapshot((value) => ({ ...value, isSaving: false, error: errorText(error) }));
      }
      return false;
    }
  }, [notifyAccountTabs, updateSnapshot]);

  const dismissBrowserImport = useCallback(() => {
    updateSnapshot((current) => ({ ...current, pendingBrowserIds: [], migrationMessage: null }));
  }, [updateSnapshot]);

  const value = useMemo<ShortlistContextValue>(() => ({
    ...snapshot,
    count: snapshot.ids.length,
    has: (locationId) => snapshot.ids.includes(locationId),
    toggle,
    remove,
    importBrowserIds,
    dismissBrowserImport,
  }), [snapshot, toggle, remove, importBrowserIds, dismissBrowserImport]);

  return <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>;
}

export function useShortlistContext(): ShortlistContextValue {
  const value = useContext(ShortlistContext);
  if (!value) throw new Error("useShortlist must be used within ShortlistProvider");
  return value;
}
