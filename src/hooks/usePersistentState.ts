import { useEffect, useState } from "react";

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

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);

  return [state, setState] as const;
}
