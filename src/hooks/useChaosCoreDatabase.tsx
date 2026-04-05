import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { usePersistentState } from "./usePersistentState";
import { useTechnicaRuntime } from "./useTechnicaRuntime";
import type { DatabaseContentType } from "../types/common";
import {
  CHAOS_CORE_DATABASE_UPDATE_EVENT,
  CHAOS_CORE_DATABASE_UPDATE_STORAGE_KEY,
  discoverChaosCoreRepo,
  listAllChaosCoreDatabase,
  listAllChaosCoreDatabaseFromSession,
  listChaosCoreDatabase,
  listChaosCoreDatabaseFromSession,
  loadChaosCoreDatabaseEntry,
  loadChaosCoreDatabaseEntryFromSession,
  parseChaosCoreDatabaseUpdate,
  resolveChaosCoreErrorMessage,
  type ChaosCoreDatabaseEntry,
  type LoadedChaosCoreDatabaseEntry
} from "../utils/chaosCoreDatabase";

const DATABASE_CONTENT_TYPES: DatabaseContentType[] = [
  "dialogue",
  "quest",
  "map",
  "npc",
  "gear",
  "item",
  "card",
  "unit",
  "operation",
  "class",
  "schema"
];

type SummaryStatus = "idle" | "loading" | "ready" | "error";

interface ChaosCoreSummaryState {
  entries: ChaosCoreDatabaseEntry[];
  status: SummaryStatus;
  stale: boolean;
  error: string | null;
}

interface ChaosCoreDatabaseContextValue {
  databaseEnabled: boolean;
  desktopEnabled: boolean;
  sessionEnabled: boolean;
  repoPath: string;
  repoPathDraft: string;
  setRepoPathDraft: (nextValue: string) => void;
  commitRepoPath: (nextValue?: string) => void;
  detectRepo: () => Promise<string | null>;
  summaryStates: Record<DatabaseContentType, ChaosCoreSummaryState>;
  ensureSummaries: (contentType: DatabaseContentType, options?: { force?: boolean }) => Promise<ChaosCoreDatabaseEntry[]>;
  ensureAllSummaries: (
    options?: { force?: boolean }
  ) => Promise<Partial<Record<DatabaseContentType, ChaosCoreDatabaseEntry[]>>>;
  loadEntry: (
    contentType: DatabaseContentType,
    entryKey: string,
    options?: { force?: boolean }
  ) => Promise<LoadedChaosCoreDatabaseEntry>;
  markStale: (contentType: DatabaseContentType) => void;
}

const EMPTY_SUMMARY_STATE: ChaosCoreSummaryState = {
  entries: [],
  status: "idle",
  stale: false,
  error: null
};

function createInitialSummaryStates() {
  return Object.fromEntries(
    DATABASE_CONTENT_TYPES.map((contentType) => [contentType, { ...EMPTY_SUMMARY_STATE }])
  ) as Record<DatabaseContentType, ChaosCoreSummaryState>;
}

function buildLoadedCacheKey(repoPath: string, contentType: DatabaseContentType, entryKey: string) {
  return `${repoPath || "session"}::${contentType}::${entryKey}`;
}

const ChaosCoreDatabaseContext = createContext<ChaosCoreDatabaseContextValue | null>(null);

interface ChaosCoreDatabaseProviderProps {
  children: ReactNode;
}

export function ChaosCoreDatabaseProvider({ children }: ChaosCoreDatabaseProviderProps) {
  const runtime = useTechnicaRuntime();
  const desktopEnabled = runtime.isDesktop;
  const sessionEnabled = runtime.isMobile && Boolean(runtime.sessionOrigin && runtime.pairingToken);
  const databaseEnabled = desktopEnabled || sessionEnabled;
  const [storedRepoPath, setStoredRepoPath] = usePersistentState("technica.chaosCoreRepoPath", "");
  const repoPath = typeof storedRepoPath === "string" ? storedRepoPath.trim() : "";
  const repoPathRef = useRef(repoPath);
  const [repoPathDraft, setRepoPathDraft] = useState(repoPath);
  const [summaryStates, setSummaryStates] = useState<Record<DatabaseContentType, ChaosCoreSummaryState>>(
    createInitialSummaryStates()
  );
  const loadedEntriesRef = useRef(new Map<string, LoadedChaosCoreDatabaseEntry>());
  const summaryRequestRef = useRef(new Map<string, Promise<ChaosCoreDatabaseEntry[]>>());
  const allSummaryRequestRef = useRef<Promise<Partial<Record<DatabaseContentType, ChaosCoreDatabaseEntry[]>>> | null>(
    null
  );
  const loadRequestRef = useRef(new Map<string, Promise<LoadedChaosCoreDatabaseEntry>>());

  useEffect(() => {
    repoPathRef.current = repoPath;
  }, [repoPath]);

  useEffect(() => {
    setRepoPathDraft(repoPath);
  }, [repoPath]);

  const clearLoadedEntriesForType = useCallback((contentType: DatabaseContentType) => {
    Array.from(loadedEntriesRef.current.keys()).forEach((cacheKey) => {
      if (cacheKey.includes(`::${contentType}::`)) {
        loadedEntriesRef.current.delete(cacheKey);
      }
    });
  }, []);

  const resetAllCaches = useCallback(() => {
    summaryRequestRef.current.clear();
    allSummaryRequestRef.current = null;
    loadRequestRef.current.clear();
    loadedEntriesRef.current.clear();
    setSummaryStates(createInitialSummaryStates());
  }, []);

  const commitRepoPath = useCallback(
    (nextValue?: string) => {
      const normalized = (nextValue ?? repoPathDraft).trim();
      setRepoPathDraft(normalized);

      if (normalized === repoPathRef.current) {
        return;
      }

      setStoredRepoPath(normalized);
      resetAllCaches();
    },
    [repoPathDraft, resetAllCaches, setStoredRepoPath]
  );

  const detectRepo = useCallback(async () => {
    if (sessionEnabled) {
      return repoPathRef.current || null;
    }

    const discovered = await discoverChaosCoreRepo();
    if (discovered && discovered.trim()) {
      setRepoPathDraft(discovered.trim());
      if (discovered.trim() !== repoPathRef.current) {
        setStoredRepoPath(discovered.trim());
        resetAllCaches();
      }
      return discovered.trim();
    }

    return null;
  }, [resetAllCaches, sessionEnabled, setStoredRepoPath]);

  const markStale = useCallback(
    (contentType: DatabaseContentType) => {
      clearLoadedEntriesForType(contentType);
      setSummaryStates((current) => ({
        ...current,
        [contentType]: {
          ...current[contentType],
          stale: true
        }
      }));
    },
    [clearLoadedEntriesForType]
  );

  const ensureSummaries = useCallback(
    async (contentType: DatabaseContentType, options?: { force?: boolean }) => {
      if (!databaseEnabled) {
        return [];
      }

      if (!sessionEnabled && !repoPathRef.current) {
        return [];
      }

      const currentState = summaryStates[contentType];
      if (!options?.force && currentState.status === "ready" && !currentState.stale) {
        return currentState.entries;
      }

      const requestKey = `${contentType}:${options?.force ? "force" : "normal"}`;
      const pendingRequest = summaryRequestRef.current.get(requestKey);
      if (pendingRequest) {
        return pendingRequest;
      }

      const request = (async () => {
        setSummaryStates((current) => ({
          ...current,
          [contentType]: {
            ...current[contentType],
            status: "loading",
            error: null
          }
        }));

        try {
          const nextEntries = sessionEnabled && runtime.sessionOrigin && runtime.pairingToken
            ? (
                await listChaosCoreDatabaseFromSession(
                  runtime.sessionOrigin,
                  runtime.pairingToken,
                  contentType,
                  options
                )
              ).entries
            : await listChaosCoreDatabase(repoPathRef.current, contentType, options);

          setSummaryStates((current) => ({
            ...current,
            [contentType]: {
              entries: nextEntries,
              status: "ready",
              stale: false,
              error: null
            }
          }));

          return nextEntries;
        } catch (error) {
          const message = resolveChaosCoreErrorMessage(error, "Could not load the Chaos Core database.");
          setSummaryStates((current) => ({
            ...current,
            [contentType]: {
              ...current[contentType],
              status: "error",
              stale: true,
              error: message
            }
          }));
          throw new Error(message);
        } finally {
          summaryRequestRef.current.delete(requestKey);
        }
      })();

      summaryRequestRef.current.set(requestKey, request);
      return request;
    },
    [databaseEnabled, repoPathRef, runtime.pairingToken, runtime.sessionOrigin, sessionEnabled, summaryStates]
  );

  const ensureAllSummaries = useCallback(
    async (options?: { force?: boolean }) => {
      if (!databaseEnabled) {
        return {};
      }

      if (!sessionEnabled && !repoPathRef.current) {
        return {};
      }

      const hasStaleType = DATABASE_CONTENT_TYPES.some((contentType) => summaryStates[contentType].stale);
      const hasIdleType = DATABASE_CONTENT_TYPES.some((contentType) => summaryStates[contentType].status === "idle");
      const allReady = DATABASE_CONTENT_TYPES.every(
        (contentType) => summaryStates[contentType].status === "ready" && !summaryStates[contentType].stale
      );

      if (!options?.force && allReady && !hasStaleType && !hasIdleType) {
        return Object.fromEntries(
          DATABASE_CONTENT_TYPES.map((contentType) => [contentType, summaryStates[contentType].entries])
        ) as Partial<Record<DatabaseContentType, ChaosCoreDatabaseEntry[]>>;
      }

      if (allSummaryRequestRef.current) {
        return allSummaryRequestRef.current;
      }

      const request = (async () => {
        setSummaryStates((current) =>
          Object.fromEntries(
            DATABASE_CONTENT_TYPES.map((contentType) => [
              contentType,
              {
                ...current[contentType],
                status: "loading",
                error: null
              }
            ])
          ) as Record<DatabaseContentType, ChaosCoreSummaryState>
        );

        try {
          const response = sessionEnabled && runtime.sessionOrigin && runtime.pairingToken
            ? await listAllChaosCoreDatabaseFromSession(runtime.sessionOrigin, runtime.pairingToken, options)
            : await listAllChaosCoreDatabase(repoPathRef.current, options);

          const nextEntriesByType = response.entriesByType ?? {};

          setSummaryStates(
            Object.fromEntries(
            DATABASE_CONTENT_TYPES.map((contentType) => [
              contentType,
                {
                  entries: nextEntriesByType[contentType] ?? [],
                  status: "ready",
                  stale: false,
                  error: null
                }
              ])
            ) as Record<DatabaseContentType, ChaosCoreSummaryState>
          );

          return nextEntriesByType;
        } catch (error) {
          const message = resolveChaosCoreErrorMessage(error, "Could not load the Chaos Core database.");
          setSummaryStates((current) =>
            Object.fromEntries(
            DATABASE_CONTENT_TYPES.map((contentType) => [
              contentType,
                {
                  ...current[contentType],
                  status: "error",
                  stale: true,
                  error: message
                }
              ])
            ) as Record<DatabaseContentType, ChaosCoreSummaryState>
          );
          throw new Error(message);
        } finally {
          allSummaryRequestRef.current = null;
        }
      })();

      allSummaryRequestRef.current = request;
      return request;
    },
    [databaseEnabled, sessionEnabled, summaryStates, runtime.pairingToken, runtime.sessionOrigin]
  );

  const loadEntry = useCallback(
    async (contentType: DatabaseContentType, entryKey: string, options?: { force?: boolean }) => {
      if (!databaseEnabled) {
        throw new Error("Chaos Core database access is not available in this Technica runtime.");
      }

      if (!sessionEnabled && !repoPathRef.current) {
        throw new Error("Set the Chaos Core repo path first.");
      }

      const cacheKey = buildLoadedCacheKey(repoPathRef.current, contentType, entryKey);
      if (!options?.force && !summaryStates[contentType].stale) {
        const cached = loadedEntriesRef.current.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      const pendingRequest = loadRequestRef.current.get(cacheKey);
      if (pendingRequest) {
        return pendingRequest;
      }

      const request = (async () => {
        try {
          const loadedEntry = sessionEnabled && runtime.sessionOrigin && runtime.pairingToken
            ? (
                await loadChaosCoreDatabaseEntryFromSession(
                  runtime.sessionOrigin,
                  runtime.pairingToken,
                  contentType,
                  entryKey,
                  options
                )
              ).entry
            : await loadChaosCoreDatabaseEntry(repoPathRef.current, contentType, entryKey, options);

          loadedEntriesRef.current.set(cacheKey, loadedEntry);
          return loadedEntry;
        } finally {
          loadRequestRef.current.delete(cacheKey);
        }
      })();

      loadRequestRef.current.set(cacheKey, request);
      return request;
    },
    [databaseEnabled, sessionEnabled, summaryStates, runtime.pairingToken, runtime.sessionOrigin]
  );

  useEffect(() => {
    if (!databaseEnabled) {
      resetAllCaches();
      return;
    }

    if (!repoPathRef.current && !sessionEnabled) {
      resetAllCaches();
    }
  }, [databaseEnabled, resetAllCaches, sessionEnabled]);

  useEffect(() => {
    function handleDatabaseUpdate(event: Event) {
      const customEvent = event as CustomEvent<{ contentType?: DatabaseContentType }>;
      if (customEvent.detail?.contentType) {
        markStale(customEvent.detail.contentType);
      }
    }

    function handleStorageUpdate(event: StorageEvent) {
      if (event.key !== CHAOS_CORE_DATABASE_UPDATE_STORAGE_KEY) {
        return;
      }

      const parsedUpdate = parseChaosCoreDatabaseUpdate(event.newValue);
      if (parsedUpdate?.contentType) {
        markStale(parsedUpdate.contentType);
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener(CHAOS_CORE_DATABASE_UPDATE_EVENT, handleDatabaseUpdate);
      window.addEventListener("storage", handleStorageUpdate);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(CHAOS_CORE_DATABASE_UPDATE_EVENT, handleDatabaseUpdate);
        window.removeEventListener("storage", handleStorageUpdate);
      }
    };
  }, [markStale]);

  const value = useMemo<ChaosCoreDatabaseContextValue>(
    () => ({
      databaseEnabled,
      desktopEnabled,
      sessionEnabled,
      repoPath,
      repoPathDraft,
      setRepoPathDraft,
      commitRepoPath,
      detectRepo,
      summaryStates,
      ensureSummaries,
      ensureAllSummaries,
      loadEntry,
      markStale
    }),
    [
      commitRepoPath,
      databaseEnabled,
      desktopEnabled,
      detectRepo,
      ensureAllSummaries,
      ensureSummaries,
      loadEntry,
      markStale,
      repoPath,
      repoPathDraft,
      sessionEnabled,
      summaryStates
    ]
  );

  return (
    <ChaosCoreDatabaseContext.Provider value={value}>{children}</ChaosCoreDatabaseContext.Provider>
  );
}

export function useChaosCoreDatabase() {
  const context = useContext(ChaosCoreDatabaseContext);
  if (!context) {
    throw new Error("useChaosCoreDatabase must be used inside ChaosCoreDatabaseProvider.");
  }
  return context;
}
