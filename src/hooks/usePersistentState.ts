import { useEffect, useRef, useState } from "react";

const DEFAULT_PERSIST_DELAY_MS = 180;

export function usePersistentState<TValue>(storageKey: string, initialValue: TValue) {
  const [state, setState] = useState<TValue>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }

    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return initialValue;
    }

    try {
      return JSON.parse(stored) as TValue;
    } catch {
      return initialValue;
    }
  });
  const latestStateRef = useRef(state);
  const pendingWriteRef = useRef<number | null>(null);
  const lastPersistedValueRef = useRef<string | null>(null);

  function persistValue(nextValue: TValue) {
    try {
      const serialized = JSON.stringify(nextValue);
      if (serialized === lastPersistedValueRef.current) {
        return;
      }

      window.localStorage.setItem(storageKey, serialized);
      lastPersistedValueRef.current = serialized;
    } catch {
      // Ignore storage errors so editing stays responsive.
    }
  }

  useEffect(() => {
    latestStateRef.current = state;

    if (pendingWriteRef.current !== null) {
      window.clearTimeout(pendingWriteRef.current);
    }

    pendingWriteRef.current = window.setTimeout(() => {
      pendingWriteRef.current = null;
      persistValue(latestStateRef.current);
    }, DEFAULT_PERSIST_DELAY_MS);

    return () => {
      if (pendingWriteRef.current !== null) {
        window.clearTimeout(pendingWriteRef.current);
        pendingWriteRef.current = null;
      }
    };
  }, [state, storageKey]);

  useEffect(() => {
    function flushPendingWrite() {
      if (pendingWriteRef.current !== null) {
        window.clearTimeout(pendingWriteRef.current);
        pendingWriteRef.current = null;
      }

      persistValue(latestStateRef.current);
    }

    window.addEventListener("beforeunload", flushPendingWrite);
    window.addEventListener("pagehide", flushPendingWrite);

    return () => {
      window.removeEventListener("beforeunload", flushPendingWrite);
      window.removeEventListener("pagehide", flushPendingWrite);
      flushPendingWrite();
    };
  }, [storageKey]);

  return [state, setState] as const;
}
