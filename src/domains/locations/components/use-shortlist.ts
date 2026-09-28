"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeShortlistIds,
  parseShortlistIds,
  SHORTLIST_STORAGE_KEY,
} from "./shortlist-storage";

const shortlistChangeEvent = "scenescan:shortlist-change";

export function useShortlist() {
  const [ids, setIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idsRef = useRef(ids);

  const syncIds = useCallback((nextIds: string[]) => {
    idsRef.current = nextIds;
    setIds(nextIds);
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === SHORTLIST_STORAGE_KEY) {
        syncIds(parseShortlistIds(event.newValue));
      }
    }

    function handleLocalChange(event: Event) {
      const nextIds = normalizeShortlistIds(
        (event as CustomEvent<unknown>).detail,
      );
      syncIds(nextIds);
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(shortlistChangeEvent, handleLocalChange);
    const hydrationTimer = window.setTimeout(() => {
      try {
        syncIds(
          parseShortlistIds(
            window.localStorage.getItem(SHORTLIST_STORAGE_KEY),
          ),
        );
      } catch {
        setError("이 브라우저에서는 관심 장소를 불러올 수 없습니다.");
      } finally {
        setIsReady(true);
      }
    }, 0);

    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(shortlistChangeEvent, handleLocalChange);
    };
  }, [syncIds]);

  const saveIds = useCallback(
    (nextIds: string[]) => {
      try {
        window.localStorage.setItem(
          SHORTLIST_STORAGE_KEY,
          JSON.stringify(nextIds),
        );
        setError(null);
        syncIds(nextIds);
        window.dispatchEvent(
          new CustomEvent(shortlistChangeEvent, { detail: nextIds }),
        );
        return true;
      } catch {
        setError("관심 장소를 브라우저에 저장하지 못했습니다.");
        return false;
      }
    },
    [syncIds],
  );

  const toggle = useCallback(
    (locationId: string) => {
      const normalizedId = locationId.trim();
      if (!normalizedId) return false;

      const currentIds = idsRef.current;
      const nextIds = currentIds.includes(normalizedId)
        ? currentIds.filter((id) => id !== normalizedId)
        : [...currentIds, normalizedId];
      return saveIds(nextIds);
    },
    [saveIds],
  );

  const remove = useCallback(
    (locationId: string) =>
      saveIds(idsRef.current.filter((id) => id !== locationId)),
    [saveIds],
  );

  return {
    ids,
    count: ids.length,
    isReady,
    error,
    has: (locationId: string) => ids.includes(locationId),
    toggle,
    remove,
  };
}
